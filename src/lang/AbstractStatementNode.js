export const AbstractStatementNode = Class => class extends Class {
	get statementNode() { return this; }
}
