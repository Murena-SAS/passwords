import Vue from 'vue';
import App from '@vue/App';
import {loadState} from '@nextcloud/initial-state';
import router from '@js/Helper/router';
import EventEmitter from 'eventemitter3';
import SectionAll from '@vue/Section/All';
import EventManager from '@js/Manager/EventManager';
import SearchManager from '@js/Manager/SearchManager';
import SettingsService from '@js/Services/SettingsService';
import KeepAliveManager from '@js/Manager/KeepAliveManager';
import SetupManager from "@js/Manager/SetupManager";
import MessageService from "@js/Services/MessageService";
import LoggingService from "@js/Services/LoggingService";
import LocalisationService from "@js/Services/LocalisationService";
import UtilityService from "@js/Services/UtilityService";
import ClientService from "@js/Services/ClientService";

class Application {

    /**
     * @returns {(null|Sidebar)}
     */
    get sidebar() {
        return this._sidebar;
    }

    /**
     *
     * @param {(null|Sidebar)} value
     */
    set sidebar(value) {
        if(this._app && !(value === null && this._sidebar === null)) {
            this._sidebar = value;
            this._app.sidebar = value;
        }
    }

    /**
     * @return {Vue}
     */
    get app() {
        return this._app;
    }

    /**
     * @return {EventEmitter}
     */
    get events() {
        return this._events;
    }

    /**
     * @return {Boolean}
     */
    get loginRequired() {
        return this._loginRequired;
    }

    /**
     *
     * @param {Boolean} value
     */
    set loginRequired(value) {
        this._loginRequired = value;
    }

    get isAuthorized() {
        return ClientService.getLegacyClient().isAuthorized || !this._loginRequired;
    }

    get isMobile() {
        return window.innerWidth <= 768;
    }

    constructor() {
        this._loaded = false;
        this._timer = null;
        this._app = null;
        this._loginRequired = true;
        this._events = new EventEmitter();
        this._sidebar = null;
    }

    /**
     *
     */
    init() {
        window.addEventListener('DOMContentLoaded', () => { this._initApp(); }, {once: true, passive: true});
        this._timer = setInterval(() => { this._initApp(); }, 10);
    }

    /**
     *
     * @returns {Promise<void>}
     * @private
     */
    _initApp() {
        if(document.readyState === 'loading' || this._loaded) return;
        clearInterval(this._timer);
        this._loaded = true;
        this._initSettings();
        if(this._initApi()) {
            this._checkLoginRequirement();
            this._initVue();
            SearchManager.init();
            EventManager.init();
            KeepAliveManager.init();
        }
        setTimeout(() => {
            LoggingService.printXssWarning();
        }, 3000);
    }

    // noinspection JSMethodCanBeStatic
    /**
     *
     * @private
     */
    _initSettings() {
        SettingsService.init();
        document.body.setAttribute('data-server-version', SettingsService.get('server.version'));

        let customBackground = SettingsService.get('server.theme.background').indexOf('/core/') === -1 ? 'true':'false';
        document.body.setAttribute('data-custom-background', customBackground);

        let customColor = SettingsService.get('server.theme.color.primary') === '#0082c9' ? 'false':'true';
        document.body.setAttribute('data-custom-color', customColor);

        document.body.style.setProperty('--pw-image-login-background', `url(${SettingsService.get('server.theme.background')})`);
        document.body.style.setProperty('--pw-image-logo-themed', `url(${SettingsService.get('server.theme.app.icon')})`);

        let appIcon = SettingsService.get('server.theme.color.text') === '#fff' ? 'app':'app-dark';
        document.body.style.setProperty('--pw-image-logo', `url(${OC.appswebroots.passwords}/img/${appIcon}.svg)`);
    }

    /**
     *
     * @returns {boolean}
     * @private
     */
    _initApi() {
        let baseUrl    = UtilityService.generateUrl(),
            user       = loadState('passwords', 'api-user', null),
            token      = loadState('passwords', 'api-token', null);

        if(!user || !token) {
            MessageService.alert('The app was unable to obtain the api access credentials.', 'Initialisation Error')
                          .then(() => { location.reload(); });
            return false;
        }

        if(baseUrl.indexOf('index.php') !== -1) baseUrl = baseUrl.substr(0, baseUrl.indexOf('index.php'));
        ClientService.initialize(baseUrl, user, token, this._events);

        return true;
    }

    /**
     * Check if the user needs to authenticate
     *
     * @private
     */
    _checkLoginRequirement() {
        let impersonate  = loadState('passwords', 'impersonate', false),
            authenticate = loadState('passwords', 'authenticate', true);
        this._loginRequired = authenticate || impersonate;

        if(!this._loginRequired) {
            document.body.classList.remove('pw-auth-visible');
            document.body.classList.add('pw-auth-skipped');
            ClientService.getLegacyClient().openSession({})
               .catch(() => {
                   this._loginRequired = true;
                   router.push({name: 'Authorize'});
               });
            SetupManager.runAutomatically();
        }
    }

    /**
     *
     * @private
     */
    _initVue() {
        let section = SettingsService.get('client.ui.section.default');

        router.addRoute({name: 'All', path: section === 'all' ? '/':'/all', param: [], components: {main: SectionAll}});
        router.addRoute({path: '*', redirect: {name: section.capitalize()}});

        router.beforeEach((to, from, next) => {
            if(!this.isAuthorized && to.name !== 'Authorize' && to.name !== 'Help') {
                let target = {name: to.name, path: to.path, hash: to.hash, params: to.params};
                target = btoa(JSON.stringify(target));
                next({name: 'Authorize', params: {target}});
            }
            next();
            if(to.name !== from.name) {
                this.sidebar = null;
            }
        });

        Vue.mixin(
            {
                methods: {
                    t: (t, v) => { return LocalisationService.translate(t, v); }
                }
            }
        );

        this._app = new Vue(App);
    }
}

export default new Application();