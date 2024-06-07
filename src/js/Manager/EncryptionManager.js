import API from "@js/Helper/api";
import Application from '@js/Init/Application';
import EventManager from '@js/Manager/EventManager';
import ClientService from "@js/Services/ClientService";
import UtilityService from '@js/Services/UtilityService';
import MessageService from '@js/Services/MessageService';
import LoggingService from "@js/Services/LoggingService";
import SettingsService from "@js/Services/SettingsService";
import LocalisationService from '@js/Services/LocalisationService';
import {loadState} from "@nextcloud/initial-state";
import {emit} from '@nextcloud/event-bus';
import WebAuthnInitializeAction from "@js/Actions/WebAuthn/WebAuthnInitializeAction";

class EncryptionManager {

    constructor() {
        this._statusFunc = null;
        this.status = null;
    }

    /**
     *
     * @param password
     * @param save
     * @param encrypt
     * @param statusFunc
     */
    async install(password, save = false, encrypt = false, statusFunc = null) {
        if(!await this.isPassphraseSecure(password)) {
            return;
        }

        this._resetStatus(statusFunc);
        await this._updateKeychain(password);

        if(encrypt !== false) {
            let tagMap    = {},
                folderMap = {};

            await Promise.all(
                [
                    this._encryptTags(tagMap),
                    this._encryptFolders(folderMap)
                ]
            );

            await this._encryptPasswords(folderMap, tagMap);
            await this._cleanDatabase(tagMap, folderMap);
        }

        if(save) await this._saveMasterPassword(password);
        Application.loginRequired = true;
        emit('passwords:encryption:installed', {});
    }

    /**
     *
     * @param password
     * @param oldPassword
     * @returns {Promise<void>}
     */
    async update(password, oldPassword) {
        try {
            if(!await this.isPassphraseSecure(password)) {
                return;
            }

            await API.setAccountChallenge(password, oldPassword);
            await this._updateWebAuthn(password);
        } catch(e) {
            throw e;
        }
    }

    /**
     *
     * @returns {Promise<boolean>}
     */
    async updateGui() {
        let data;
        try {
            data = await MessageService.form(
                {
                    password      : {
                        label    : 'New password',
                        type     : 'password',
                        button   : 'toggle',
                        minlength: 12,
                        required : true,
                        title    : 'Your password must be longer than 12 characters and not the old password',
                        validator: (value, fields) => {
                            return value !== fields.oldPassword && value.length >= 12;
                        }
                    },
                    repeatPassword: {
                        label    : 'Repeat password',
                        type     : 'password',
                        button   : 'toggle',
                        required : true,
                        title    : 'Please confirm your new password',
                        validator: (value, fields) => {
                            return value === fields.password;
                        }
                    },
                    oldPassword   : {
                        label    : 'Old password',
                        type     : 'password',
                        button   : 'toggle',
                        title    : 'You must enter your old password',
                        required : true,
                        validator: (value) => {
                            return value.length >= 12;
                        }
                    }
                },
                'Change Password',
                'You can use this dialog to change your master password.'
            );
        } catch(e) {
            return false;
        }

        try {
            UtilityService.lockApp();
            await this.update(data.password, data.oldPassword);
            UtilityService.unlockApp();
            MessageService.alert('Your password has been changed successfully.', 'Password changed');
        } catch(e) {
            UtilityService.unlockApp();
            LoggingService.error(e);
            MessageService.alert(e.message, 'Changing password failed');
            return false;
        }
        return true;
    }

    async isPassphraseSecure(passphrase) {
        let result = true;
        if(passphrase.length < 12) {
            result = false;
        } else {
            let hashService    = /** @type {HashService} **/ await ClientService.getClient().getInstance('service.hash'),
                hash           = await hashService.getHash(passphrase),
                breachedHashes = await hashService.getBreachedHashes(hash.substring(0, 5));

            result = breachedHashes.indexOf(hash) === -1;
        }

        if(!result) {
            MessageService
                .alert('CSENewPassphraseInsecureText', 'CSEPassphraseInsecureTitle')
                .catch(LoggingService.catch);
        }

        return result;
    }

    /**
     *
     * @param password
     * @returns {Promise<void>}
     * @private
     */
    async _updateKeychain(password) {
        this._sendStatus('keychain', 'processing', 1);
        try {
            await API.setAccountChallenge(password);
            await Promise.all([await SettingsService.reset('user.encryption.cse'), await SettingsService.reset('user.encryption.sse')]);
            this._sendStatus('keychain', 'done');
        } catch(e) {
            this._sendStatus('keychain', 'error', e);
            throw e;
        }
    }

    /**
     *
     * @param folderMap
     * @param tagMap
     * @returns {Promise<void>}
     * @private
     */
    async _encryptPasswords(folderMap, tagMap) {
        this._sendStatus('passwords', 'loading');
        let passwords = await API.listPasswords('model+tags'),
            queue     = [];

        this._sendStatus('passwords', 'processing', Object.keys(passwords).length);
        for(let id in passwords) {
            if(!passwords.hasOwnProperty(id)) continue;
            let password = passwords[id];

            queue.push(this._encryptPassword(password, folderMap, tagMap));
        }

        if(queue.length !== 0) await Promise.all(queue);
        this._sendStatus('passwords', 'done');
    }

    /**
     *
     * @param password
     * @param folderMap
     * @param tagMap
     * @param current
     * @param total
     * @returns {Promise<void>}
     * @private
     */
    async _encryptPassword(password, folderMap, tagMap, current, total) {
        password.folder = folderMap[password.folder];

        let tags = [];
        for(let id in password.tags) {
            if(!password.tags.hasOwnProperty(id)) continue;
            tags.push(tagMap[id]);
        }
        password.tags = tags;

        if(!password.shared && password.share === null) {
            await this._deleteObject(password.id, 'password');
            password.cseType = 'CSEv1r1';

            try {
                await API.createPassword(password);
                LoggingService.success(`Encrypted password ${password.id}`);
                this._sendStatus('passwords');
            } catch(e) {
                this._sendStatus('passwords', 'error', e);
                throw e;
            }
        } else {
            try {
                await API.updatePassword(password);
                LoggingService.success(`Updated password ${password.id}`);
                this._sendStatus('passwords');
            } catch(e) {
                this._sendStatus('passwords', 'error', e);
                throw e;
            }
        }
    }

    /**
     *
     * @returns {Promise<void>}
     * @private
     */
    async _encryptTags(idMap) {
        this._sendStatus('tags', 'loading');
        let tags  = await API.listTags(),
            queue = [];

        this._sendStatus('tags', 'processing', Object.keys(tags).length);
        for(let id in tags) {
            if(!tags.hasOwnProperty(id)) continue;

            queue.push(this._encryptTag(tags[id], idMap));

            if(queue.length > 10) {
                await Promise.all(queue);
                queue = [];
            }
        }

        if(queue.length !== 0) await Promise.all(queue);

        this._sendStatus('tags', 'done');
        return idMap;
    }

    /**
     *
     * @param tag
     * @param idMap
     * @returns {Promise<void>}
     * @private
     */
    async _encryptTag(tag, idMap) {
        try {
            tag.cseType = 'CSEv1r1';

            let result = await API.createTag(tag);
            idMap[tag.id] = result.id;

            this._sendStatus('tags');
            LoggingService.success(`Encrypted tag ${tag.id}`);
        } catch(e) {
            this._sendStatus('tags', 'error', e);
            throw e;
        }
    }

    /**
     *
     * @param idMap
     * @returns {Promise<*>}
     * @private
     */
    async _encryptFolders(idMap) {
        this._sendStatus('folders', 'loading');
        let folders = await API.listFolders(),
            queue   = [];

        idMap['00000000-0000-0000-0000-000000000000'] = '00000000-0000-0000-0000-000000000000';
        folders = this._sortFoldersForUpgrade(folders);

        this._sendStatus('folders', 'processing', Object.keys(folders).length);
        for(let folder of folders) {
            if(folder.id === '00000000-0000-0000-0000-000000000000') continue;

            if(!idMap.hasOwnProperty(folder.parent) || queue.length > 10) {
                await Promise.all(queue);
                queue = [];
            }

            queue.push(this._encryptFolder(folder, idMap));
        }

        await Promise.all(queue);

        this._sendStatus('folders', 'done');
        return idMap;
    }

    /**
     *
     * @param folder
     * @param idMap
     * @returns {Promise<void>}
     * @private
     */
    async _encryptFolder(folder, idMap) {
        try {
            folder.parent = idMap[folder.parent];
            folder.cseType = 'CSEv1r1';

            let result = await API.createFolder(folder);
            idMap[folder.id] = result.id;

            this._sendStatus('folders');
            LoggingService.success(`Encrypted folder ${folder.id}`);
        } catch(e) {
            this._sendStatus('folders', 'error', e);
            throw e;
        }
    }

    // noinspection JSMethodCanBeStatic
    /**
     *
     * @param folderDb
     * @returns {Array}
     * @private
     */
    _sortFoldersForUpgrade(folderDb) {
        let folders = [],
            sortLog = ['00000000-0000-0000-0000-000000000000'];

        folderDb = UtilityService.objectToArray(folderDb);
        while(folderDb.length !== 0) {
            for(let i = 0; i < folderDb.length; i++) {
                let folder = folderDb[i];

                if(sortLog.indexOf(folder.parent) !== -1) {
                    sortLog.push(folder.id);
                    folders.push(folder);
                    folderDb.splice(i, 1);
                    i--;
                }
            }
        }

        return folders;
    }

    /**
     *
     * @param tagMap
     * @param folderMap
     * @returns {Promise<void>}
     * @private
     */
    async _cleanDatabase(tagMap, folderMap) {
        let total = Object.keys(tagMap).length + Object.keys(folderMap).length;

        this._sendStatus('cleanup', 'processing', total);
        EventManager.ignoreApiErrors = true;
        await Promise.all(
            [
                this._deleteObjects(tagMap, 'tag'),
                this._deleteObjects(folderMap, 'folder')
            ]
        );
        EventManager.ignoreApiErrors = false;
        this._sendStatus('cleanup', 'done');
    }

    /**
     *
     * @param idMap
     * @param type
     * @returns {Promise<void>}
     * @private
     */
    async _deleteObjects(idMap, type) {
        let queue = [];

        for(let id in idMap) {
            if(idMap.hasOwnProperty(id) && id !== '00000000-0000-0000-0000-000000000000') {
                queue.push(this._deleteObject(id, type));

                if(queue.length > 10) {
                    await Promise.all(queue);
                    queue = [];
                }
            }
        }

        if(queue.length !== 0) await Promise.all(queue);
    }

    /**
     *
     * @param id
     * @param type
     * @returns {Promise<void>}
     * @private
     */
    async _deleteObject(id, type) {
        let deleteFunc = 'delete' + type.capitalize();

        try {
            await API[deleteFunc](id);
            await API[deleteFunc](id);
        } catch(e) {
            if(!e.hasOwnProperty('id') || e.id !== 404) {
                this._sendStatus('cleanup', 'error', e);
            }
        }

        if(type !== 'password') this._sendStatus('cleanup', 'processing');
    }

    /**
     *
     * @param password
     * @returns {Promise<void>}
     * @private
     */
    async _saveMasterPassword(password) {
        this._sendStatus('password', 'processing', 1);
        let username = loadState('passwords', 'api-user', null),
            label    = LocalisationService.translate('Passwords App Encryption Passphrase'),
            notes    = LocalisationService.translate(
                'This is a copy of the passphrase you chose for encryption. Changing or deleting this entry does not affect the encryption. The passphrase can only be changed in the settings. More information can be found in the handbook.'),
            url      = location.href;

        try {
            await API.createPassword({username, password, label, url, notes});
            this._sendStatus('password', 'done');
        } catch(e) {
            this._sendStatus('password', 'error', e);
        }
    }

    /**
     *
     * @param statusFunc
     * @private
     */
    _resetStatus(statusFunc) {
        this._statusFunc = statusFunc;
        this.status = {
            passwords: {status: 'waiting', total: 0, current: 0, errors: []},
            keychain : {status: 'waiting', total: 0, current: 0, errors: []},
            folders  : {status: 'waiting', total: 0, current: 0, errors: []},
            cleanup  : {status: 'waiting', total: 0, current: 0, errors: []},
            tags     : {status: 'waiting', total: 0, current: 0, errors: []},
            save     : {status: 'waiting', total: 0, current: 0, errors: []}
        };
    }

    /**
     *
     * @param section
     * @param status
     * @param data
     * @private
     */
    _sendStatus(section, status = 'processing', data = null) {
        if(this._statusFunc === null || !this.status.hasOwnProperty(section)) return;
        let object = this.status[section];

        if(status === 'processing') {
            object.status = 'processing';
            if(data !== null) {
                object.total = data;
                object.current = 0;
            } else {
                object.current++;
            }
        } else if(status === 'loading') {
            object.status = 'loading';
        } else if(status === 'done') {
            object.status = object.errors.length === 0 ? 'success':'failed';
            if(object.status === 'success') object.current = object.total;
        } else if(status === 'error') {
            LoggingService.error(data);
            object.errors.push(data);
            if(section !== 'cleanup') object.status = 'failed';
        }

        this._statusFunc(this.status);
    }

    async _updateWebAuthn(password) {
        if(SettingsService.get('client.encryption.webauthn.enabled')) {
            try {
                await (WebAuthnInitializeAction).run(password);
            } catch(e) {
                LoggingService.error(e);
            }
        }
    }
}

export default new EncryptionManager();