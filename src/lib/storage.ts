import type { AuditEntry, AuditAction, Expense, ExpenseInput, Member, PaymentMethod } from './types';
import { MEMBERS, TRIP_ID } from './constants';
import { supabase } from './supabase';
import { round2 } from './calculations';

export type StorageMode = 'supabase' | 'local';

export interface LedgerStorage {
  readonly mode: StorageMode;
  init(): Promise<void>;
  loadExpenses(): Promise<Expense[]>;
  loadMembers(): Promise<Member[]>;
  loadAudit(): Promise<AuditEntry[]>;
  /** Creates a row + an INSERT audit entry. `enteredBy` always comes from the active profile. */
  addExpense(input: ExpenseInput, enteredBy: string, receiptFile?: File | null): Promise<Expense>;
  /** Only the member who entered the expense may edit it (enforced server-side too). */
  updateExpense(
    id: string,
    patch: Partial<ExpenseInput>,
    memberId: string,
    receiptFile?: File | null,
  ): Promise<Expense>;
  deleteExpense(id: string, memberId: string): Promise<void>;
  /** Fires whenever the ledger changes (Supabase realtime / cross-tab broadcast). */
  subscribe(onChange: () => void): () => void;
}

const errText = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : 'Something went wrong';

const LOCAL_KEYS = {
  expenses: 'tripkhata.expenses.v1',
  audit: 'tripkhata.audit.v1',
  members: 'tripkhata.members.v1',
};

const MAX_LOCAL_RECEIPT_BYTES = 500 * 1024;

/* ------------------------------------------------------------------ */
/* Local mode — no Supabase credentials required                       */
/* ------------------------------------------------------------------ */

class LocalLedger implements LedgerStorage {
  readonly mode: StorageMode = 'local';
  private channel: BroadcastChannel | null = null;

  async init(): Promise<void> {
    if (!localStorage.getItem(LOCAL_KEYS.members)) {
      const now = new Date().toISOString();
      const seeded: Member[] = MEMBERS.map((m) => ({
        id: m.id,
        trip_id: TRIP_ID,
        name: m.name,
        created_at: now,
      }));
      localStorage.setItem(LOCAL_KEYS.members, JSON.stringify(seeded));
    }
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('tripkhata-ledger');
    }
  }

  private read<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private write(key: string, value: unknown): void {
    localStorage.setItem(key, JSON.stringify(value));
  }

  private pushAudit(entry: Omit<AuditEntry, 'id' | 'changed_at'>): void {
    const list = this.read<AuditEntry[]>(LOCAL_KEYS.audit, []);
    list.push({ ...entry, id: crypto.randomUUID(), changed_at: new Date().toISOString() });
    this.write(LOCAL_KEYS.audit, list);
  }

  async loadExpenses(): Promise<Expense[]> {
    return this.read<Expense[]>(LOCAL_KEYS.expenses, []);
  }

  async loadMembers(): Promise<Member[]> {
    return this.read<Member[]>(LOCAL_KEYS.members, []);
  }

  async loadAudit(): Promise<AuditEntry[]> {
    return this.read<AuditEntry[]>(LOCAL_KEYS.audit, []);
  }

  private async readReceipt(file: File): Promise<string> {
    if (file.size > MAX_LOCAL_RECEIPT_BYTES) {
      throw new Error('Receipt is larger than 500 KB. Connect Supabase for bigger files.');
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not read the receipt file.'));
      reader.readAsDataURL(file);
    });
  }

  async addExpense(
    input: ExpenseInput,
    enteredBy: string,
    receiptFile?: File | null,
  ): Promise<Expense> {
    const now = new Date().toISOString();
    const receiptUrl = receiptFile ? await this.readReceipt(receiptFile) : (input.receipt_url ?? null);
    const expense: Expense = {
      id: crypto.randomUUID(),
      trip_id: TRIP_ID,
      title: input.title.trim(),
      amount: round2(input.amount),
      category: input.category,
      description: input.description?.trim() || null,
      paid_by_member_id: input.paid_by_member_id,
      entered_by_member_id: enteredBy,
      payment_method: input.payment_method,
      expense_date: input.expense_date,
      receipt_url: receiptUrl,
      created_at: now,
      updated_at: now,
    };

    const list = await this.loadExpenses();
    list.push(expense);
    this.write(LOCAL_KEYS.expenses, list);

    this.pushAudit({
      expense_id: expense.id,
      trip_id: TRIP_ID,
      action: 'INSERT',
      changed_by_member_id: enteredBy,
      old_values: null,
      new_values: { ...expense },
    });
    this.channel?.postMessage('changed');
    return expense;
  }

  async updateExpense(
    id: string,
    patch: Partial<ExpenseInput>,
    memberId: string,
    receiptFile?: File | null,
  ): Promise<Expense> {
    const list = await this.loadExpenses();
    const idx = list.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error('Expense not found.');
    const old = list[idx];
    if (old.entered_by_member_id !== memberId) {
      throw new Error('Only the member who entered this expense can edit it.');
    }

    const nextReceipt = receiptFile
      ? await this.readReceipt(receiptFile)
      : patch.receipt_url !== undefined
        ? patch.receipt_url
        : undefined;

    const next: Expense = {
      ...old,
      ...(patch.title !== undefined ? { title: patch.title.trim() } : null),
      ...(patch.amount !== undefined ? { amount: round2(patch.amount) } : null),
      ...(patch.category !== undefined ? { category: patch.category } : null),
      ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : null),
      ...(patch.paid_by_member_id !== undefined
        ? { paid_by_member_id: patch.paid_by_member_id }
        : null),
      ...(patch.payment_method !== undefined ? { payment_method: patch.payment_method } : null),
      ...(patch.expense_date !== undefined ? { expense_date: patch.expense_date } : null),
      ...(nextReceipt !== undefined ? { receipt_url: nextReceipt } : null),
      updated_at: new Date().toISOString(),
    };
    list[idx] = next;
    this.write(LOCAL_KEYS.expenses, list);

    this.pushAudit({
      expense_id: id,
      trip_id: TRIP_ID,
      action: 'UPDATE',
      changed_by_member_id: memberId,
      old_values: { ...old },
      new_values: { ...next },
    });
    this.channel?.postMessage('changed');
    return next;
  }

  async deleteExpense(id: string, memberId: string): Promise<void> {
    const list = await this.loadExpenses();
    const target = list.find((e) => e.id === id);
    if (!target) throw new Error('Expense not found.');
    if (target.entered_by_member_id !== memberId) {
      throw new Error('Only the member who entered this expense can delete it.');
    }
    this.write(
      LOCAL_KEYS.expenses,
      list.filter((e) => e.id !== id),
    );
    this.pushAudit({
      expense_id: id,
      trip_id: TRIP_ID,
      action: 'DELETE',
      changed_by_member_id: memberId,
      old_values: { ...target },
      new_values: null,
    });
    this.channel?.postMessage('changed');
  }

  subscribe(onChange: () => void): () => void {
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key.startsWith('tripkhata.')) onChange();
    };
    const onChannel = () => onChange();
    window.addEventListener('storage', onStorage);
    this.channel?.addEventListener('message', onChannel);
    return () => {
      window.removeEventListener('storage', onStorage);
      this.channel?.removeEventListener('message', onChannel);
    };
  }
}

/* ------------------------------------------------------------------ */
/* Supabase mode — RLS, realtime, server-side ownership checks         */
/* ------------------------------------------------------------------ */

class SupabaseLedger implements LedgerStorage {
  readonly mode: StorageMode = 'supabase';

  private get client() {
    if (!supabase) throw new Error('Supabase is not configured.');
    return supabase;
  }

  async init(): Promise<void> {
    const sb = this.client;

    const { data: trip, error: tripErr } = await sb
      .from('trips')
      .select('id')
      .eq('id', TRIP_ID)
      .maybeSingle();
    if (tripErr) throw new Error(`Could not reach the trips table: ${tripErr.message}`);
    if (!trip) {
      const { error } = await sb.from('trips').insert({ id: TRIP_ID, name: 'Manali Trip' });
      if (error && error.code !== '23505') throw new Error(error.message);
    }

    const { data: existing, error: memberErr } = await sb
      .from('members')
      .select('id')
      .eq('trip_id', TRIP_ID);
    if (memberErr) throw new Error(`Could not reach the members table: ${memberErr.message}`);
    if (!existing || existing.length === 0) {
      const now = new Date().toISOString();
      const { error } = await sb.from(
        'members',
      ).insert(
        MEMBERS.map((m) => ({ id: m.id, trip_id: TRIP_ID, name: m.name, created_at: now })),
      );
      if (error && error.code !== '23505') throw new Error(error.message);
    }
  }

  async loadExpenses(): Promise<Expense[]> {
    const { data, error } = await this.client
      .from('expenses')
      .select('*')
      .eq('trip_id', TRIP_ID)
      .order('expense_date', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Expense[];
  }

  async loadMembers(): Promise<Member[]> {
    const { data, error } = await this.client
      .from('members')
      .select('*')
      .eq('trip_id', TRIP_ID)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    if (data && data.length > 0) return data as Member[];
    // Fallback to the shared seed order if the table was created manually.
    return MEMBERS.map((m) => ({ id: m.id, trip_id: TRIP_ID, name: m.name, created_at: '' }));
  }

  async loadAudit(): Promise<AuditEntry[]> {
    const { data, error } = await this.client
      .from('expense_audit')
      .select('*')
      .eq('trip_id', TRIP_ID)
      .order('changed_at', { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as AuditEntry[];
  }

  private async uploadReceipt(file: File): Promise<string> {
    const path = `${TRIP_ID}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
    const { error } = await this.client.storage.from('receipts').upload(path, file, {
      upsert: false,
      contentType: file.type || undefined,
    });
    if (error) throw new Error(`Receipt upload failed: ${error.message}`);
    const { data } = this.client.storage.from('receipts').getPublicUrl(path);
    return data.publicUrl;
  }

  async addExpense(
    input: ExpenseInput,
    enteredBy: string,
    receiptFile?: File | null,
  ): Promise<Expense> {
    let receiptUrl = input.receipt_url ?? null;
    if (receiptFile) receiptUrl = await this.uploadReceipt(receiptFile);

    const row = {
      trip_id: TRIP_ID,
      title: input.title.trim(),
      amount: round2(input.amount),
      category: input.category,
      description: input.description?.trim() || null,
      paid_by_member_id: input.paid_by_member_id,
      entered_by_member_id: enteredBy,
      payment_method: input.payment_method,
      expense_date: input.expense_date,
      receipt_url: receiptUrl,
    };

    const { data, error } = await this.client.from('expenses').insert(row).select().single();
    if (error) throw new Error(error.message);
    const expense = data as Expense;

    const { error: auditError } = await this.client.from('expense_audit').insert({
      expense_id: expense.id,
      trip_id: TRIP_ID,
      action: 'INSERT',
      changed_by_member_id: enteredBy,
      old_values: null,
      new_values: { ...expense },
    });
    if (auditError) console.warn('Audit entry not written:', auditError.message);

    return expense;
  }

  async updateExpense(
    id: string,
    patch: Partial<ExpenseInput>,
    memberId: string,
    receiptFile?: File | null,
  ): Promise<Expense> {
    const payload: Record<string, unknown> = {};
    if (patch.title !== undefined) payload.title = patch.title.trim();
    if (patch.amount !== undefined) payload.amount = round2(patch.amount);
    if (patch.category !== undefined) payload.category = patch.category;
    if (patch.description !== undefined) payload.description = patch.description?.trim() || null;
    if (patch.paid_by_member_id !== undefined) payload.paid_by_member_id = patch.paid_by_member_id;
    if (patch.payment_method !== undefined) payload.payment_method = patch.payment_method;
    if (patch.expense_date !== undefined) payload.expense_date = patch.expense_date;
    if (receiptFile) payload.receipt_url = await this.uploadReceipt(receiptFile);
    else if (patch.receipt_url !== undefined) payload.receipt_url = patch.receipt_url;

    const { data, error } = await this.client.rpc('update_expense', {
      p_expense_id: id,
      p_member_id: memberId,
      p_patch: payload,
    });
    if (error) throw new Error(error.message);
    const rows = Array.isArray(data) ? data : [data];
    return rows[0] as Expense;
  }

  async deleteExpense(id: string, memberId: string): Promise<void> {
    const { error } = await this.client.rpc('delete_expense', {
      p_expense_id: id,
      p_member_id: memberId,
    });
    if (error) throw new Error(error.message);
  }

  subscribe(onChange: () => void): () => void {
    const channel = this.client
      .channel('tripkhata-ledger')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, onChange)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'expense_audit' },
        onChange,
      )
      .subscribe();
    return () => {
      void this.client.removeChannel(channel);
    };
  }
}

let instance: LedgerStorage | null = null;

export function getStorage(): LedgerStorage {
  if (!instance) {
    instance = supabase ? new SupabaseLedger() : new LocalLedger();
  }
  return instance;
}

export const storageMode: StorageMode = supabase ? 'supabase' : 'local';

export { errText };
export type { AuditAction, PaymentMethod };
