export const SugarMixin = Class => class extends Class {
    get isSugar() { return true; }
}