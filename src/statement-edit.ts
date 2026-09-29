import type { CardEntry, CardStatement, Category, State } from './domain';

export type EntryDraft = {
  categories: Record<string, Category>;
  amounts: Record<string, string>;
  deletedIds: string[];
};

export type StatementEdit = {
  id: string;
  revision: number;
  entries: CardEntry[];
  deleted_ids: string[];
  confirmed_total: number;
};

export function prepareStatementEdits(statements: CardStatement[], entries: CardEntry[], draft: EntryDraft) {
  const deleted = new Set(draft.deletedIds);
  const editedEntries = entries.map(entry => ({...entry,
    category: draft.categories[entry.id] ?? entry.category,
    amount: draft.amounts[entry.id] === undefined ? entry.amount : Number(draft.amounts[entry.id])
  }));
  const changedIds = new Set(editedEntries.filter((entry, index) => deleted.has(entry.id)
    || entry.category !== entries[index].category || entry.amount !== entries[index].amount).map(entry => entry.statement_id));
  const changes: StatementEdit[] = statements.filter(statement => changedIds.has(statement.id)).map(statement => {
    const remaining = editedEntries.filter(entry => entry.statement_id === statement.id && !deleted.has(entry.id));
    return {id: statement.id, revision: statement.revision ?? 0, entries: remaining,
      deleted_ids: entries.filter(entry => entry.statement_id === statement.id && deleted.has(entry.id)).map(entry => entry.id),
      confirmed_total: remaining.reduce((sum, entry) => sum + entry.amount, 0)};
  });
  const valid = changes.every(change => change.entries.every(entry => Number.isSafeInteger(entry.amount)
    && entry.amount !== 0 && Math.abs(entry.amount) <= 100_000_000)
    && (!change.entries.length || (change.confirmed_total > 0 && change.confirmed_total <= 100_000_000)));
  return {editedEntries, changes, valid};
}

// Reflect each successful save so retrying a later failure never resends a stale revision.
export function applyStatementEdit<T extends Pick<State, 'entries'|'statements'>>(state: T, edit: StatementEdit): T {
  const updated = new Map(edit.entries.map(entry => [entry.id, entry]));
  return {...state,
    entries: state.entries.flatMap(entry => entry.statement_id !== edit.id ? [entry] : updated.has(entry.id) ? [updated.get(entry.id)!] : []),
    statements: state.statements.flatMap(statement => statement.id !== edit.id ? [statement] : edit.entries.length
      ? [{...statement, confirmed_total: edit.confirmed_total, revision: edit.revision + 1}] : [])
  };
}
