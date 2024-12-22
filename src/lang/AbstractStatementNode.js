export const AbstractStatementNode = Class => class extends Class {

	#querySugars = new Set;
	
	get statementNode() { return this; }

	get querySugars() { return this.#querySugars; }

	get hasSugars() { return this.isSugar || !!this.#querySugars.size; }

	$bubble(eventType, eventSource) {
		if (['CONNECTED', 'DISCONNECTED'].includes(eventType) && eventSource.isSugar) {
			if (eventType === 'DISCONNECTED') this.#querySugars.delete(eventSource);
			else this.#querySugars.add(eventSource);
			// return; // Don't bubble beyond this point. think dimensional queries
		}
		return super.$bubble(eventType, eventSource);
	}

}
