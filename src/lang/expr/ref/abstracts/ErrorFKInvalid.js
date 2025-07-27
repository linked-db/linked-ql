export class ErrorFKInvalid extends Error {

    constructor(message) {
        super(message);
        this.name = 'ErrorFKInvalid';
    }

}