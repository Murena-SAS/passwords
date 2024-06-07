import LoggingService from "@js/Services/LoggingService";

/**
 * @deprecated
 */
class Events {

    /**
     *
     */
    constructor() {
        this.events = [];
        this.alias = {
            'password.created' : ['password.changed', 'data.changed'],
            'password.updated' : ['password.changed', 'data.changed'],
            'password.deleted' : ['password.changed', 'data.changed'],
            'password.restored': ['password.changed', 'data.changed'],
            'folder.created'   : ['folder.changed', 'data.changed'],
            'folder.updated'   : ['folder.changed', 'data.changed'],
            'folder.deleted'   : ['folder.changed', 'data.changed'],
            'folder.restored'  : ['folder.changed', 'data.changed'],
            'tag.created'      : ['tag.changed', 'data.changed'],
            'tag.deleted'      : ['tag.changed', 'data.changed'],
            'tag.updated'      : ['tag.changed', 'data.changed'],
            'tag.restored'     : ['tag.changed', 'data.changed']
        };
    }

    /**
     *
     * @param event
     * @param callback
     */
    on(event, callback) {
        if(!this.events.hasOwnProperty(event)) {
            this.events[event] = [];
        }

        this.events[event].push(callback);
    }

    /**
     *
     * @param event
     * @param callback
     */
    off(event, callback) {
        if(!this.events.hasOwnProperty(event)) return;
        let callbacks = this.events[event];

        while(callbacks.indexOf(callback) !== -1) {
            let index = callbacks.indexOf(callback);
            callbacks = callbacks.remove(index);
        }
    }

    /**
     * @deprecated
     * @param event
     * @param object
     */
    fire(event, object = {}) {
        this.emit(event, object);
    }

    /**
     *
     * @param event
     * @param object
     */
    emit(event, object = {}) {

        let events = [event];
        if(this.alias.hasOwnProperty(event)) {
            events = events.concat(this.alias[event]);
        }

        for(let i = 0; i < events.length; i++) {
            let event = events[i];
            if(!this.events.hasOwnProperty(event)) continue;

            let data      = {event, object},
                callbacks = this.events[event];
            for(let j = 0; j < callbacks.length; j++) {
                try {
                    callbacks[j](data);
                } catch(e) {
                    LoggingService.error(e);
                }
            }
        }
    }
}

/**
 * @deprecated
 */
let E = new Events();

/**
 * @deprecated
 */
export default E;