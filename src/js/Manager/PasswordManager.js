import Vue from 'vue';
import API from '@js/Helper/api';
import Events from '@js/Classes/Events';
import ToastService from "@js/Services/ToastService";
import FolderManager from "@js/Manager/FolderManager";
import MessageService from "@js/Services/MessageService";
import UtilityService from "@js/Services/UtilityService";
import LoggingService from "@js/Services/LoggingService";

/**
 *
 */
class PasswordManager {

    /**
     *
     * @param folder
     * @param tag
     * @returns {Promise}
     */
    createPassword(folder = null, tag = null) {
        return new Promise(async (resolve, reject) => {
            let properties = {},
                _success   = (p) => {
                    this.createPasswordFromData(p)
                        .then(resolve)
                        .catch(reject);
                };

            if(folder) {
                properties.folder = folder;
            } else {
                properties.folder = '00000000-0000-0000-0000-000000000000';
            }
            if(tag) properties.tags = [tag];

            let PasswordDialog = await import(/* webpackChunkName: "CreatePassword" */ '@vue/Dialog/CreatePassword.vue'),
                PwCreateDialog = Vue.extend(PasswordDialog.default);

            new PwCreateDialog({propsData: {properties, _success}}).$mount(UtilityService.popupContainer());
        });
    }

    /**
     *
     * @param password
     * @returns {Promise<any>}
     */
    createPasswordFromData(password) {
        return new Promise((resolve, reject) => {
            API.createPassword(password)
               .then(async (data) => {
                   ToastService.success('Password created');

                   if(password.hasOwnProperty('tags')) {
                       let model = await API.showPassword(data.id, '+tags');
                       password.tags = model.tags;
                   }

                   password.id = data.id;
                   password._encrypted = password.cseKey?.length > 0;
                   password.cseKey = data.cseKey;
                   password.cseType = data.cseType;
                   password.status = 3;
                   password.statusCode = 'NOT_CHECKED';
                   password.editable = true;
                   password.revision = data.revision;
                   password.edited = password.created = password.updated = UtilityService.getTimestamp();
                   if(!password.label) API._generatePasswordTitle(password);
                   password = await API._processPassword(password);
                   Events.fire('password.created', password);
                   API.showPassword(password.id)
                      .then((data) => {
                          password.status = data.status;
                          password.statusCode = data.statusCode;
                      });
                   resolve(password);
               })
               .catch((e) => {
                   LoggingService.error(e);
                   ToastService.error('Creating password failed');
                   reject(password);
               });
        });
    }

    /**
     *
     * @param password
     * @returns {Promise}
     */
    editPassword(password) {
        return new Promise(async (resolve, reject) => {
            if(!password.tags) {
                let tagData = await API.showPassword(password.id, 'model+tags');
                password.tags = tagData.tags;
            }

            let propsData      = {properties: UtilityService.cloneObject(password), title: 'Edit password'},
                PasswordDialog = await import(/* webpackChunkName: "CreatePassword" */ '@vue/Dialog/CreatePassword.vue'),
                PwCreateDialog = Vue.extend(PasswordDialog.default),
                DialogWindow   = new PwCreateDialog({propsData}).$mount(UtilityService.popupContainer());

            DialogWindow._success = (p) => {
                p = UtilityService.mergeObject(password, p);
                if(!p.label) API._generatePasswordTitle(p);
                if(password.password !== p.password) {
                    p.edited = new Date();
                } else {
                    p.edited = password.edited;
                }

                API.updatePassword(p)
                   .then((d) => {
                       p.revision = d.revision;
                       p.updated = new Date();
                       if(password.hasOwnProperty('tags')) p.tags = password.tags;
                       if(typeof p.customFields === 'string') p.customFields = JSON.parse(p.customFields);

                       Events.fire('password.updated', p);
                       ToastService.success('Password saved');
                       API.showPassword(p.id)
                          .then((data) => {
                              p.status = data.status;
                              p.statusCode = data.statusCode;
                          });
                       resolve(p);
                   })
                   .catch((e) => {
                       LoggingService.error(e);
                       ToastService.error('Saving password failed');
                       reject(password);
                   });
            };
            DialogWindow._fail = reject;
        });
    }

    /**
     *
     * @param password
     * @return {Promise<unknown>}
     */
    clonePassword(password) {
        return new Promise(async (resolve, reject) => {
            let properties = UtilityService.cloneObject(password);
            properties.id = null;
            properties.status = null;
            properties.statusCode = null;
            properties.revision = null;
            properties.password = null;
            properties.updated = null;
            properties.created = null;
            properties.edited = null;

            for(let customField of properties.customFields) {
                if(customField.type === 'secret') {
                    customField.value = '';
                }
            }

            if(!properties.hasOwnProperty('tags')) {
                let model = await API.showPassword(password.id, '+tags');
                properties.tags = model.tags;
            }

            let _success = (p) => {
                this.createPasswordFromData(p)
                    .then(resolve)
                    .catch(reject);
            };

            let PasswordDialog = await import(/* webpackChunkName: "CreatePassword" */ '@vue/Dialog/CreatePassword.vue'),
                PwCreateDialog = Vue.extend(PasswordDialog.default);

            new PwCreateDialog({propsData: {properties, _success}}).$mount(UtilityService.popupContainer());
            PwCreateDialog._fail = reject;
        });
    }

    /**
     *
     * @param password
     * @param folder
     * @returns {Promise<any>}
     */
    movePassword(password, folder = null) {
        return new Promise(async (resolve, reject) => {
            let folderModel = null;
            if(folder === null) {
                folderModel = await FolderManager.selectFolder(password.folder);
                folder = folderModel.id;
            }
            if(password.id === folder || password.folder === folder) {
                reject(password);
                return;
            }

            if(password.hidden) {
                if(folderModel === null) {
                    folderModel = await API.showFolder(folder);
                }

                if(!folderModel.hidden) {
                    password.hidden = false;
                }
            }

            let originalFolder = password.folder;
            password.folder = folder;
            API.updatePassword(password)
               .then((d) => {
                   password.revision = d.revision;
                   password.updated = new Date();
                   Events.fire('password.updated', password);
                   ToastService.info('Password moved');
                   resolve(password);
               })
               .catch((e) => {
                   LoggingService.error(e);
                   ToastService.error('Moving password failed');
                   password.folder = originalFolder;
                   reject(password);
               });
        });
    }

    /**
     *
     * @param password
     * @returns {Promise}
     */
    updatePassword(password) {
        return new Promise((resolve, reject) => {
            API.updatePassword(password)
               .then((d) => {
                   password.revision = d.revision;
                   password.updated = new Date();
                   Events.fire('password.updated', password);
                   resolve(password);
               })
               .catch((e) => {
                   LoggingService.error(e);
                   reject(password);
               });
        });
    }

    /**
     *
     * @param password
     * @param confirm
     * @returns {Promise}
     */
    deletePassword(password, confirm = true) {
        return new Promise((resolve, reject) => {
            if(!confirm || !password.trashed) {
                API.deletePassword(password.id, password.revision)
                   .then((d) => {
                       password.trashed = true;
                       password.updated = new Date();
                       password.revision = d.revision;
                       if(password.hidden) this.deletePassword(password, false);
                       Events.fire('password.deleted', password);
                       ToastService.info('Password deleted');
                       resolve(password);
                   })
                   .catch((e) => {
                       if(e.id && e.id === 'f281915e') {
                           password.trashed = true;
                           password.updated = new Date();
                           if(password.hidden) this.deletePassword(password, false);
                           Events.fire('password.deleted', password);
                           resolve(password);
                       } else {
                           ToastService.error('Deleting password failed');
                           reject(password);
                       }
                   });
            } else {
                MessageService.confirm('Do you want to delete the password', 'Delete password')
                        .then(() => { this.deletePassword(password, false); })
                        .catch(() => {reject(password);});
            }
        });
    }

    /**
     *
     * @param password
     * @returns {Promise}
     */
    restorePassword(password) {
        return new Promise((resolve, reject) => {
            if(password.trashed) {
                API.restorePassword(password.id)
                   .then((d) => {
                       password.trashed = false;
                       password.revision = d.revision;
                       Events.fire('password.restored', password);
                       ToastService.info('Password restored');
                       resolve(password);
                   })
                   .catch(() => {
                       ToastService.error('Restoring password failed');
                       reject(password);
                   });
            } else {
                reject(password);
            }
        });
    }

    /**
     *
     * @param password
     * @param revision
     * @param confirm
     * @returns {Promise<any>}
     */
    restoreRevision(password, revision, confirm = true) {
        return new Promise((resolve, reject) => {
            if(password.revision === revision.id) reject(new Error('Revision is current revision'));

            if(!confirm) {
                API.restorePassword(password.id, revision.id)
                   .then((d) => {
                       password = UtilityService.mergeObject(password, revision);
                       password.id = d.id;
                       password.updated = new Date();
                       password.revision = d.revision;
                       Events.fire('password.restored', password);
                       ToastService.info('Revision restored');
                       resolve(password);
                   })
                   .catch((e) => {
                       ToastService.error('Restoring revision failed');
                       reject(e);
                   });
            } else {
                MessageService.confirm('Do you want to restore the revision?', 'Restore revision')
                        .then(() => { this.restoreRevision(password, revision, false).then(resolve).catch(reject); })
                        .catch(() => {reject(new Error('User aborted revision restore'));});
            }
        });
    }

    // noinspection JSMethodCanBeStatic
    /**
     *
     * @param password
     * @param revision
     *
     * @returns {Promise}
     */
    async viewRevision(password, revision) {
        let RevisionDialog     = await import(/* webpackChunkName: "ViewRevision" */ '@vue/Dialog/ViewRevision.vue'),
            ViewRevisionDialog = Vue.extend(RevisionDialog.default);

        new ViewRevisionDialog({propsData: {password, revision}}).$mount(UtilityService.popupContainer());
    }
}

export default new PasswordManager();