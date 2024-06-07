/*
 * @copyright 2023 Passwords App
 *
 * @author Marius David Wieschollek
 * @license AGPL-3.0
 *
 * This file is part of the Passwords App
 * created by Marius David Wieschollek.
 */

import PrintPasswordAction from "@js/Actions/Password/PrintPasswordAction";
import PasswordManager from "@js/Manager/PasswordManager";
import Vue from "vue";
import AddTagAction from "@js/Actions/Password/AddTagAction";
import Events from "@js/Classes/Events";
import ToastService from "@js/Services/ToastService";
import UtilityService from "@js/Services/UtilityService";
import LocalisationService from "@js/Services/LocalisationService";
import LoggingService from "@js/Services/LoggingService";

export default class PasswordActions {
    get password() {
        return this._password;
    }

    constructor(password) {
        this._password = password;
        Events.on('password.changed', (event) => {
            if(this._password.id === event.object.id) {
                this._password = event.object;
            }
        })
    }

    print() {
        let printer = new PrintPasswordAction(this._password);
        printer.print().catch(LoggingService.exception);
    }

    async favorite(status = null) {
        let oldStatus = this._password.favorite === true;
        if(status !== null) {
            this._password.favorite = status === true;
        } else {
            this._password.favorite = !this._password.favorite;
        }

        try {
            await PasswordManager.updatePassword(this._password);
        } catch(e) {
            this._password.favorite = oldStatus;
            LoggingService.error(e);
        }

        return this._password;
    }

    edit() {
        return PasswordManager.editPassword(this._password);
    }

    clone() {
        return PasswordManager.clonePassword(this._password);
    }

    delete() {
        return PasswordManager.deletePassword(this._password);
    }

    move(folder = null) {
        return PasswordManager.movePassword(this._password, folder);
    }

    async addTag(tag) {
        let action = new AddTagAction(this._password);
        this._password = await action.addTag(tag);
        return this._password;
    }

    async qrcode() {
        let PasswordQrCode = await import(/* webpackChunkName: "QrCode" */ '@vue/Dialog/QrCode.vue'),
            PwQrCodeDialog = Vue.extend(PasswordQrCode.default);

        new PwQrCodeDialog({propsData: {password: this._password}}).$mount(UtilityService.popupContainer());
    }

    async openChangePasswordPage() {
        let ChangePasswordPage = await import(/* webpackChunkName: "ChangePasswordPage" */ '@vue/Dialog/ChangePasswordPage.vue'),
            ChangePasswordPageDialog = Vue.extend(ChangePasswordPage.default);

        new ChangePasswordPageDialog({propsData: {password: this._password}}).$mount(UtilityService.popupContainer());
    }

    clipboard(attribute) {
        let message = 'Error copying {element} to clipboard';
        if(!this._password.hasOwnProperty(attribute) || this._password[attribute].length === 0) {
            message = 'ClipboardCopyEmpty';
        } else {
            if(UtilityService.copyToClipboard(this._password[attribute])) message = '{element} was copied to clipboard';
        }

        ToastService.info([message, {element: LocalisationService.translate(attribute.capitalize())}]);
    }
}