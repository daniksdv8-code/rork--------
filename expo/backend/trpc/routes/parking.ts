import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { createHash, randomBytes } from "crypto";

let fsAvailable = false;
const DATA_DIR = join(process.cwd(), ".data");
const DATA_FILE = join(DATA_DIR, "parking-store.json");
const TEMP_FILE = join(DATA_DIR, "parking-store.tmp.json");

try {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(join(DATA_DIR, ".probe"), "ok", "utf-8");
  fsAvailable = true;
  console.log("[Storage] Filesystem available, data will persist to disk");
} catch {
  fsAvailable = false;
  console.log("[Storage] Filesystem NOT available (Deno Worker?), using in-memory storage only");
}

const MAX_TRANSACTIONS = 10000;
const MAX_ACTION_LOGS = 5000;

let store: Record<string, unknown> | null = null;
let version = 0;
let restoreEpoch = 0;
let writeLock = false;

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt ?? randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(password + s).digest("hex");
  return { hash, salt: s };
}

function verifyPassword(password: string, hash: string, salt: string): boolean {
  const computed = createHash("sha256").update(password + salt).digest("hex");
  return computed === hash;
}

function loadFromDisk(): boolean {
  if (!fsAvailable) {
    console.log("[Storage] No filesystem, skipping disk load");
    return false;
  }
  try {
    if (!existsSync(DATA_FILE)) {
      console.log("[Storage] No data file found, will initialize fresh");
      return false;
    }
    const raw = readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    store = parsed.store ?? null;
    version = parsed.version ?? 0;
    restoreEpoch = parsed.restoreEpoch ?? 0;
    console.log(`[Storage] Loaded from disk: version=${version}, epoch=${restoreEpoch}, users=${(store as any)?.users?.length ?? 0}`);
    return true;
  } catch (e) {
    console.error("[Storage] Failed to load data file:", e);
    return false;
  }
}

function saveToDisk() {
  if (!fsAvailable) return;
  if (writeLock) {
    setTimeout(() => saveToDisk(), 50);
    return;
  }
  writeLock = true;
  try {
    const payload = JSON.stringify({ store, version, restoreEpoch }, null, 2);
    writeFileSync(TEMP_FILE, payload, "utf-8");
    renameSync(TEMP_FILE, DATA_FILE);
  } catch (e) {
    console.error("[Storage] Failed to save data:", e);
  } finally {
    writeLock = false;
  }
}

function initDefaultAdmin() {
  const { hash, salt } = hashPassword("admin");
  const now = new Date().toISOString();
  store = {
    clients: [],
    cars: [],
    sessions: [],
    subscriptions: [],
    payments: [],
    debts: [],
    transactions: [],
    tariffs: { monthlyCash: 150, monthlyCard: 160, onetimeCash: 150, onetimeCard: 200 },
    shifts: [],
    expenses: [],
    withdrawals: [],
    users: [
      {
        id: "admin_default",
        login: "admin",
        passwordHash: hash,
        passwordSalt: salt,
        name: "Администратор",
        role: "admin",
        active: true,
        updatedAt: now,
      },
    ],
    deletedClientIds: [],
    scheduledShifts: [],
    actionLogs: [],
    adminExpenses: [],
    adminCashOperations: [],
    expenseCategories: [],
    dailyDebtAccruals: [],
    clientDebts: [],
    cashOperations: [],
    teamViolations: [],
  };
  version = 1;
  restoreEpoch = 0;
  saveToDisk();
  console.log("[Init] Created default admin (login: admin, password: admin). Change password after first login!");
}

const loaded = loadFromDisk();
if (!loaded || !store) {
  initDefaultAdmin();
}

function migratePasswords() {
  if (!store) return;
  const users = (store as any).users as any[] ?? [];
  let migrated = false;
  for (const u of users) {
    if (u.password && !u.passwordHash) {
      const { hash, salt } = hashPassword(u.password);
      u.passwordHash = hash;
      u.passwordSalt = salt;
      delete u.password;
      migrated = true;
      console.log(`[Migration] Migrated password for user: ${u.login}`);
    }
  }
  if (migrated) {
    saveToDisk();
    console.log("[Migration] Password migration complete");
  }
}
migratePasswords();

function stripSensitiveFromUsers(users: any[]): any[] {
  if (!Array.isArray(users)) return [];
  return users.map((u: any) => {
    const { password: _p, passwordHash: _h, passwordSalt: _s, ...rest } = u;
    return rest;
  });
}

function mergeArraysById(base: any[], incoming: any[]): any[] {
  const map = new Map<string, any>();
  for (const item of base || []) {
    if (item?.id) map.set(item.id, item);
  }
  for (const item of incoming || []) {
    if (item?.id) {
      const existing = map.get(item.id);
      if (existing && existing.updatedAt && item.updatedAt) {
        if (new Date(item.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
          map.set(item.id, item);
        }
      } else {
        map.set(item.id, item);
      }
    }
  }
  return Array.from(map.values());
}

function unionById(base: any[], incoming: any[]): any[] {
  const map = new Map<string, any>();
  for (const item of base || []) {
    if (item?.id) map.set(item.id, item);
  }
  for (const item of incoming || []) {
    if (item?.id) {
      const existing = map.get(item.id);
      if (!existing) {
        map.set(item.id, item);
      } else if (item.updatedAt && existing.updatedAt) {
        if (new Date(item.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
          map.set(item.id, item);
        }
      } else if (!existing.updatedAt && item.updatedAt) {
        map.set(item.id, item);
      }
    }
  }
  return Array.from(map.values());
}

function mergeSessionsById(base: any[], incoming: any[]): any[] {
  const map = new Map<string, any>();
  for (const item of base || []) {
    if (item?.id) map.set(item.id, item);
  }
  for (const item of incoming || []) {
    if (item?.id) {
      const existing = map.get(item.id);
      if (existing) {
        if (
          (existing.status === "completed" || existing.cancelled) &&
          item.status === "active" &&
          !item.cancelled
        ) {
          if (
            item.updatedAt &&
            existing.updatedAt &&
            new Date(item.updatedAt).getTime() > new Date(existing.updatedAt).getTime()
          ) {
            map.set(item.id, item);
          }
          continue;
        }
        if (existing.updatedAt && item.updatedAt) {
          if (new Date(item.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
            map.set(item.id, item);
          }
        } else {
          map.set(item.id, item);
        }
      } else {
        map.set(item.id, item);
      }
    }
  }
  return Array.from(map.values());
}

function mergeShiftsById(base: any[], incoming: any[]): any[] {
  const map = new Map<string, any>();
  for (const item of base || []) {
    if (item?.id) map.set(item.id, item);
  }
  for (const item of incoming || []) {
    if (item?.id) {
      const existing = map.get(item.id);
      if (existing) {
        if (existing.status === "closed" && item.status === "open") {
          if (
            item.updatedAt &&
            existing.updatedAt &&
            new Date(item.updatedAt).getTime() > new Date(existing.updatedAt).getTime()
          ) {
            map.set(item.id, item);
          }
          continue;
        }
        if (existing.updatedAt && item.updatedAt) {
          if (new Date(item.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
            map.set(item.id, item);
          }
        } else {
          map.set(item.id, item);
        }
      } else {
        map.set(item.id, item);
      }
    }
  }
  return Array.from(map.values());
}

function mergePaymentsById(base: any[], incoming: any[]): any[] {
  const map = new Map<string, any>();
  for (const item of base || []) {
    if (item?.id) map.set(item.id, item);
  }
  for (const item of incoming || []) {
    if (item?.id) {
      const existing = map.get(item.id);
      if (!existing) {
        map.set(item.id, item);
        continue;
      }
      if (existing.cancelled && !item.cancelled) continue;
      if (!existing.cancelled && item.cancelled) {
        map.set(item.id, item);
        continue;
      }
      if (item.updatedAt && existing.updatedAt) {
        if (new Date(item.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
          map.set(item.id, item);
        }
      } else {
        map.set(item.id, item);
      }
    }
  }
  return Array.from(map.values());
}

function mergeSubscriptions(base: any[], incoming: any[]): any[] {
  const map = new Map<string, any>();
  for (const item of base || []) {
    if (item?.id) map.set(item.id, item);
  }
  for (const item of incoming || []) {
    if (item?.id) {
      const existing = map.get(item.id);
      if (existing) {
        if (item.updatedAt && existing.updatedAt) {
          if (new Date(item.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
            map.set(item.id, item);
          }
        } else if (item.paidUntil && existing.paidUntil) {
          if (new Date(item.paidUntil).getTime() >= new Date(existing.paidUntil).getTime()) {
            map.set(item.id, item);
          }
        } else {
          map.set(item.id, item);
        }
      } else {
        map.set(item.id, item);
      }
    }
  }
  return Array.from(map.values());
}

function mergeDebts(base: any[], incoming: any[]): any[] {
  const baseMap = new Map<string, any>();
  for (const item of base || []) {
    if (item?.id) baseMap.set(item.id, item);
  }
  const incomingMap = new Map<string, any>();
  for (const item of incoming || []) {
    if (item?.id) incomingMap.set(item.id, item);
  }
  const allIds = new Set([...baseMap.keys(), ...incomingMap.keys()]);
  const result: any[] = [];
  for (const id of allIds) {
    const b = baseMap.get(id);
    const i = incomingMap.get(id);
    if (b && i) {
      if (i.updatedAt && b.updatedAt) {
        result.push(new Date(i.updatedAt).getTime() >= new Date(b.updatedAt).getTime() ? i : b);
      } else {
        result.push(i.remainingAmount <= b.remainingAmount ? i : b);
      }
    } else if (i) {
      result.push(i);
    } else if (b) {
      result.push(b);
    }
  }
  return result;
}

function mergeTariffs(base: any, incoming: any): any {
  if (!base) return incoming;
  if (!incoming) return base;
  if (incoming.updatedAt && base.updatedAt) {
    return new Date(incoming.updatedAt).getTime() >= new Date(base.updatedAt).getTime() ? incoming : base;
  }
  return incoming;
}

function mergeActionLogs(base: any[], incoming: any[]): any[] {
  const map = new Map<string, any>();
  for (const item of base || []) {
    if (item?.id) map.set(item.id, item);
  }
  for (const item of incoming || []) {
    if (item?.id) map.set(item.id, item);
  }
  const all = Array.from(map.values());
  all.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return all.slice(0, MAX_ACTION_LOGS);
}

function mergeUsersServerWins(serverUsers: any[], incomingUsers: any[]): any[] {
  const map = new Map<string, any>();
  for (const item of serverUsers || []) {
    if (item?.id) map.set(item.id, item);
  }
  for (const item of incomingUsers || []) {
    if (item?.id) {
      const existing = map.get(item.id);
      if (!existing) {
        if (item.passwordHash) {
          map.set(item.id, item);
        }
      } else {
        if (item.updatedAt && existing.updatedAt) {
          if (new Date(item.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
            const merged = { ...item };
            merged.passwordHash = existing.passwordHash;
            merged.passwordSalt = existing.passwordSalt;
            if (item.password) delete merged.password;
            map.set(item.id, merged);
          }
        }
      }
    }
  }
  return Array.from(map.values());
}

function capTransactions(transactions: any[]): any[] {
  if (!Array.isArray(transactions)) return [];
  if (transactions.length <= MAX_TRANSACTIONS) return transactions;
  const sorted = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return sorted.slice(0, MAX_TRANSACTIONS);
}

function mergeScheduledShifts(base: any[], incoming: any[]): any[] {
  const map = new Map<string, any>();
  for (const item of base || []) {
    if (item?.id) map.set(item.id, item);
  }
  for (const item of incoming || []) {
    if (item?.id) {
      const existing = map.get(item.id);
      if (!existing) {
        map.set(item.id, item);
      } else if (item.updatedAt && existing.updatedAt) {
        if (new Date(item.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
          map.set(item.id, item);
        }
      } else {
        map.set(item.id, item);
      }
    }
  }
  return Array.from(map.values());
}

function getStoreDataForClient(): Record<string, any> | null {
  if (!store) return null;
  const storeData = store as Record<string, any>;
  return {
    ...storeData,
    users: stripSensitiveFromUsers(storeData.users ?? []),
  };
}

export function getBackupJson(): string {
  const clientData = getStoreDataForClient();
  const backupObj = {
    formatId: 'park_manager_backup',
    version: 2,
    createdAt: new Date().toISOString(),
    createdBy: 'server',
    data: clientData ?? {},
  };
  return JSON.stringify(backupObj);
}

const dataSchema = z.object({
  clients: z.array(z.any()),
  cars: z.array(z.any()),
  sessions: z.array(z.any()),
  subscriptions: z.array(z.any()),
  payments: z.array(z.any()),
  debts: z.array(z.any()),
  transactions: z.array(z.any()),
  tariffs: z.any(),
  shifts: z.array(z.any()).optional(),
  expenses: z.array(z.any()).optional(),
  withdrawals: z.array(z.any()).optional(),
  users: z.array(z.any()).optional(),
  deletedClientIds: z.array(z.string()).optional(),
  scheduledShifts: z.array(z.any()).optional(),
  actionLogs: z.array(z.any()).optional(),
  adminExpenses: z.array(z.any()).optional(),
  adminCashOperations: z.array(z.any()).optional(),
  expenseCategories: z.array(z.any()).optional(),
  dailyDebtAccruals: z.array(z.any()).optional(),
  clientDebts: z.array(z.any()).optional(),
  cashOperations: z.array(z.any()).optional(),
  teamViolations: z.array(z.any()).optional(),
});

export const parkingRouter = createTRPCRouter({
  getData: publicProcedure.query(() => {
    return {
      data: getStoreDataForClient(),
      version,
      initialized: store !== null,
      restoreEpoch,
    };
  }),

  login: publicProcedure
    .input(
      z.object({
        login: z.string(),
        password: z.string(),
      })
    )
    .mutation(({ input }) => {
      if (!store) {
        console.log("[Auth] Login attempt but store not initialized");
        return { success: false as const, error: "Сервер не инициализирован. Попробуйте позже." };
      }
      const storeData = store as Record<string, any>;
      const users = (storeData.users as any[]) ?? [];
      const user = users.find(
        (u: any) =>
          u.login?.toLowerCase() === input.login.toLowerCase() &&
          u.active !== false &&
          !u.deleted
      );
      if (!user) {
        console.log(`[Auth] Login failed for: ${input.login} (user not found)`);
        return { success: false as const, error: "Неверный логин или пароль, либо аккаунт заблокирован" };
      }

      let passwordValid = false;
      if (user.passwordHash && user.passwordSalt) {
        passwordValid = verifyPassword(input.password, user.passwordHash, user.passwordSalt);
      } else if (user.password) {
        passwordValid = user.password === input.password;
        if (passwordValid) {
          const { hash, salt } = hashPassword(input.password);
          user.passwordHash = hash;
          user.passwordSalt = salt;
          delete user.password;
          saveToDisk();
          console.log(`[Auth] Migrated password on login for: ${input.login}`);
        }
      }

      if (!passwordValid) {
        console.log(`[Auth] Login failed for: ${input.login} (wrong password)`);
        return { success: false as const, error: "Неверный логин или пароль, либо аккаунт заблокирован" };
      }

      const { password: _pw, passwordHash: _h, passwordSalt: _s, ...safeUser } = user;
      console.log(`[Auth] Login success: ${input.login} (${user.role})`);
      return { success: true as const, user: safeUser };
    }),

  changePassword: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        currentPassword: z.string(),
        newPassword: z.string(),
      })
    )
    .mutation(({ input }) => {
      if (!store) return { success: false, error: "Сервер не инициализирован" };
      const storeData = store as Record<string, any>;
      const users = (storeData.users as any[]) ?? [];
      const user = users.find((u: any) => u.id === input.userId);
      if (!user) return { success: false, error: "Пользователь не найден" };

      let currentValid = false;
      if (user.passwordHash && user.passwordSalt) {
        currentValid = verifyPassword(input.currentPassword, user.passwordHash, user.passwordSalt);
      } else if (user.password) {
        currentValid = user.password === input.currentPassword;
      }
      if (!currentValid) return { success: false, error: "Неверный текущий пароль" };

      const { hash, salt } = hashPassword(input.newPassword);
      user.passwordHash = hash;
      user.passwordSalt = salt;
      delete user.password;
      user.updatedAt = new Date().toISOString();
      version++;
      saveToDisk();
      console.log(`[Auth] Password changed for user: ${input.userId}`);
      return { success: true };
    }),

  addUser: publicProcedure
    .input(
      z.object({
        id: z.string(),
        login: z.string(),
        password: z.string(),
        name: z.string(),
        role: z.enum(["admin", "manager"]),
        updatedAt: z.string(),
      })
    )
    .mutation(({ input }) => {
      if (!store) return { success: false, error: "Сервер не инициализирован" };
      const storeData = store as Record<string, any>;
      const users = (storeData.users as any[]) ?? [];
      const existingLogin = users.find(
        (u: any) => u.login?.toLowerCase() === input.login.toLowerCase() && !u.deleted
      );
      if (existingLogin) return { success: false, error: "Логин уже используется" };

      const { hash, salt } = hashPassword(input.password);
      users.push({
        id: input.id,
        login: input.login,
        passwordHash: hash,
        passwordSalt: salt,
        name: input.name,
        role: input.role,
        active: true,
        updatedAt: input.updatedAt,
      });
      storeData.users = users;
      version++;
      saveToDisk();
      console.log(`[Auth] User added: ${input.login} (${input.role}), version: ${version}`);
      return { success: true, version };
    }),

  removeUser: publicProcedure
    .input(
      z.object({
        userId: z.string(),
      })
    )
    .mutation(({ input }) => {
      if (!store) return { success: false, error: "Сервер не инициализирован" };
      const storeData = store as Record<string, any>;
      const users = (storeData.users as any[]) ?? [];
      const user = users.find((u: any) => u.id === input.userId);
      if (!user) return { success: false, error: "Пользователь не найден" };
      if (user.role === "admin") return { success: false, error: "Нельзя удалить администратора" };

      user.deleted = true;
      user.active = false;
      user.updatedAt = new Date().toISOString();
      version++;
      saveToDisk();
      console.log(`[Auth] User soft-deleted: ${input.userId}, version: ${version}`);
      return { success: true, version };
    }),

  toggleUserActive: publicProcedure
    .input(
      z.object({
        userId: z.string(),
      })
    )
    .mutation(({ input }) => {
      if (!store) return { success: false, error: "Сервер не инициализирован" };
      const storeData = store as Record<string, any>;
      const users = (storeData.users as any[]) ?? [];
      const user = users.find((u: any) => u.id === input.userId);
      if (!user) return { success: false, error: "Пользователь не найден" };
      if (user.role === "admin") return { success: false, error: "Нельзя блокировать администратора" };

      user.active = !user.active;
      user.updatedAt = new Date().toISOString();
      version++;
      saveToDisk();
      console.log(`[Auth] User toggled: ${input.userId}, active=${user.active}, version: ${version}`);
      return { success: true, version, active: user.active };
    }),

  updateUserPassword: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        newPassword: z.string(),
      })
    )
    .mutation(({ input }) => {
      if (!store) return { success: false, error: "Сервер не инициализирован" };
      const storeData = store as Record<string, any>;
      const users = (storeData.users as any[]) ?? [];
      const user = users.find((u: any) => u.id === input.userId);
      if (!user) return { success: false, error: "Пользователь не найден" };

      const { hash, salt } = hashPassword(input.newPassword);
      user.passwordHash = hash;
      user.passwordSalt = salt;
      delete user.password;
      user.updatedAt = new Date().toISOString();
      version++;
      saveToDisk();
      console.log(`[Auth] Manager password updated: ${input.userId}, version: ${version}`);
      return { success: true, version };
    }),

  updateAdminProfile: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        currentPassword: z.string(),
        updates: z.object({
          login: z.string().optional(),
          password: z.string().optional(),
          name: z.string().optional(),
        }),
      })
    )
    .mutation(({ input }) => {
      if (!store) return { success: false, error: "Сервер не инициализирован" };
      const storeData = store as Record<string, any>;
      const users = (storeData.users as any[]) ?? [];
      const admin = users.find((u: any) => u.id === input.userId && u.role === "admin");
      if (!admin) return { success: false, error: "Администратор не найден" };

      let currentValid = false;
      if (admin.passwordHash && admin.passwordSalt) {
        currentValid = verifyPassword(input.currentPassword, admin.passwordHash, admin.passwordSalt);
      } else if (admin.password) {
        currentValid = admin.password === input.currentPassword;
      }
      if (!currentValid) return { success: false, error: "Неверный текущий пароль" };

      if (input.updates.login) {
        const loginTaken = users.find(
          (u: any) =>
            u.login?.toLowerCase() === input.updates.login!.toLowerCase() &&
            u.id !== input.userId &&
            !u.deleted
        );
        if (loginTaken) return { success: false, error: "Этот логин уже используется" };
        admin.login = input.updates.login;
      }
      if (input.updates.password) {
        const { hash, salt } = hashPassword(input.updates.password);
        admin.passwordHash = hash;
        admin.passwordSalt = salt;
        delete admin.password;
      }
      if (input.updates.name) {
        admin.name = input.updates.name;
      }
      admin.updatedAt = new Date().toISOString();
      version++;
      saveToDisk();
      const { password: _pw2, passwordHash: _h, passwordSalt: _s, ...safeAdmin } = admin;
      console.log(`[Auth] Admin profile updated: ${input.userId}, version: ${version}`);
      return { success: true, user: safeAdmin, version };
    }),

  resetData: publicProcedure.input(dataSchema).mutation(({ input }) => {
    const existingUsers = store ? ((store as Record<string, any>).users as any[]) ?? [] : [];

    const incomingUsers = (input.users ?? []).map((u: any) => {
      if (u.passwordHash && u.passwordSalt) return u;
      if (u.password && u.password !== "***") {
        const { hash, salt } = hashPassword(u.password);
        return { ...u, passwordHash: hash, passwordSalt: salt, password: undefined };
      }
      const existing = existingUsers.find((eu: any) => eu.id === u.id);
      if (existing) {
        return { ...u, passwordHash: existing.passwordHash, passwordSalt: existing.passwordSalt, password: undefined };
      }
      return u;
    });

    store = {
      clients: input.clients ?? [],
      cars: input.cars ?? [],
      sessions: input.sessions ?? [],
      subscriptions: input.subscriptions ?? [],
      payments: input.payments ?? [],
      debts: input.debts ?? [],
      transactions: capTransactions(input.transactions ?? []),
      tariffs: input.tariffs,
      shifts: input.shifts ?? [],
      expenses: input.expenses ?? [],
      withdrawals: input.withdrawals ?? [],
      users: incomingUsers,
      deletedClientIds: input.deletedClientIds ?? [],
      scheduledShifts: input.scheduledShifts ?? [],
      actionLogs: (input.actionLogs ?? []).slice(0, MAX_ACTION_LOGS),
      adminExpenses: (input as any).adminExpenses ?? [],
      adminCashOperations: (input as any).adminCashOperations ?? [],
      expenseCategories: (input as any).expenseCategories ?? [],
      dailyDebtAccruals: (input as any).dailyDebtAccruals ?? [],
      clientDebts: (input as any).clientDebts ?? [],
      cashOperations: (input as any).cashOperations ?? [],
      teamViolations: (input as any).teamViolations ?? [],
    };
    version++;
    restoreEpoch++;
    saveToDisk();
    console.log(
      `[ParkingStore] DATA RESET, version: ${version}, restoreEpoch: ${restoreEpoch}, users: ${incomingUsers.length}`
    );
    return { version, restoreEpoch, data: getStoreDataForClient() };
  }),

  pushData: publicProcedure
    .input(
      dataSchema.extend({
        expectedVersion: z.number().optional(),
        clientRestoreEpoch: z.number().optional(),
      })
    )
    .mutation(({ input }) => {
      if (input.clientRestoreEpoch !== undefined && input.clientRestoreEpoch !== restoreEpoch) {
        console.log(
          `[ParkingStore] Epoch mismatch: client=${input.clientRestoreEpoch}, server=${restoreEpoch}. Forcing full resync.`
        );
        return {
          version,
          restoreEpoch,
          data: getStoreDataForClient(),
          epochConflict: true,
        };
      }

      if (input.expectedVersion !== undefined && input.expectedVersion !== null) {
        if (store !== null && input.expectedVersion < version) {
          console.log(
            `[ParkingStore] Version conflict: client has ${input.expectedVersion}, server has ${version}. Merging with server priority.`
          );
        }
      }

      const existingData = store as Record<string, any> | null;

      const deletedClientIds = [
        ...new Set([
          ...(input.deletedClientIds ?? []),
          ...((existingData?.deletedClientIds as string[]) ?? []),
        ]),
      ];
      const deletedSet = new Set<string>(deletedClientIds);

      let clients: any[];
      let cars: any[];
      let sessions: any[];
      let subscriptions: any[];
      let payments: any[];
      let debts: any[];
      let transactions: any[];
      let shifts: any[];
      let expenses: any[];
      let withdrawals: any[];
      let users: any[];
      let scheduledShifts: any[];
      let actionLogs: any[];
      let tariffs: any;

      if (existingData) {
        clients = mergeArraysById(existingData.clients, input.clients).filter(
          (c: any) => !deletedSet.has(c.id)
        );
        cars = mergeArraysById(existingData.cars, input.cars).filter(
          (c: any) => !deletedSet.has(c.clientId)
        );
        sessions = mergeSessionsById(existingData.sessions, input.sessions).filter(
          (s: any) => !deletedSet.has(s.clientId)
        );
        subscriptions = mergeSubscriptions(existingData.subscriptions, input.subscriptions).filter(
          (s: any) => !deletedSet.has(s.clientId)
        );
        payments = mergePaymentsById(existingData.payments, input.payments ?? []);
        debts = mergeDebts(existingData.debts, input.debts).filter(
          (d: any) => !deletedSet.has(d.clientId)
        );
        transactions = capTransactions(unionById(existingData.transactions, input.transactions ?? []));
        shifts = mergeShiftsById(existingData.shifts ?? [], input.shifts ?? []);
        expenses = unionById(existingData.expenses ?? [], input.expenses ?? []);
        withdrawals = unionById(existingData.withdrawals ?? [], input.withdrawals ?? []);
        users = mergeUsersServerWins(existingData.users ?? [], input.users ?? []);
        scheduledShifts = mergeScheduledShifts(
          existingData.scheduledShifts ?? [],
          input.scheduledShifts ?? []
        );
        actionLogs = mergeActionLogs(existingData.actionLogs ?? [], input.actionLogs ?? []);
        tariffs = mergeTariffs(existingData.tariffs, input.tariffs);
      } else {
        clients = (input.clients ?? []).filter((c: any) => !deletedSet.has(c.id));
        cars = (input.cars ?? []).filter((c: any) => !deletedSet.has(c.clientId));
        sessions = (input.sessions ?? []).filter((s: any) => !deletedSet.has(s.clientId));
        subscriptions = (input.subscriptions ?? []).filter((s: any) => !deletedSet.has(s.clientId));
        payments = input.payments ?? [];
        debts = (input.debts ?? []).filter((d: any) => !deletedSet.has(d.clientId));
        transactions = capTransactions(input.transactions ?? []);
        shifts = input.shifts ?? [];
        expenses = input.expenses ?? [];
        withdrawals = input.withdrawals ?? [];
        users = (input.users ?? []).map((u: any) => {
          if (u.passwordHash) return u;
          if (u.password && u.password !== "***") {
            const { hash, salt } = hashPassword(u.password);
            return { ...u, passwordHash: hash, passwordSalt: salt, password: undefined };
          }
          return u;
        });
        scheduledShifts = input.scheduledShifts ?? [];
        actionLogs = (input.actionLogs ?? []).slice(0, MAX_ACTION_LOGS);
        tariffs = input.tariffs;
      }

      const openShifts = shifts.filter((s: any) => s.status === "open");
      if (openShifts.length > 1) {
        console.log(
          `[ParkingStore] WARNING: ${openShifts.length} open shifts detected. Keeping only the newest.`
        );
        openShifts.sort(
          (a: any, b: any) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime()
        );
        const keepId = openShifts[0].id;
        const now = new Date().toISOString();
        shifts = shifts.map((s: any) => {
          if (s.status === "open" && s.id !== keepId) {
            return {
              ...s,
              status: "closed",
              closedAt: now,
              notes: "Автоматически закрыта (конфликт)",
              updatedAt: now,
            };
          }
          return s;
        });
      }

      const adminExpensesMerged = existingData
        ? unionById((existingData as any).adminExpenses ?? [], (input as any).adminExpenses ?? [])
        : ((input as any).adminExpenses ?? []);
      const adminCashOpsMerged = existingData
        ? unionById((existingData as any).adminCashOperations ?? [], (input as any).adminCashOperations ?? [])
        : ((input as any).adminCashOperations ?? []);
      const expenseCatsMerged = existingData
        ? mergeArraysById((existingData as any).expenseCategories ?? [], (input as any).expenseCategories ?? [])
        : ((input as any).expenseCategories ?? []);
      const dailyDebtAccrualsMerged = existingData
        ? unionById((existingData as any).dailyDebtAccruals ?? [], (input as any).dailyDebtAccruals ?? [])
        : ((input as any).dailyDebtAccruals ?? []);
      const clientDebtsMerged = existingData
        ? mergeArraysById((existingData as any).clientDebts ?? [], (input as any).clientDebts ?? []).filter(
            (cd: any) => !deletedSet.has(cd.clientId)
          )
        : ((input as any).clientDebts ?? []).filter((cd: any) => !deletedSet.has(cd.clientId));
      const cashOpsMerged = existingData
        ? unionById((existingData as any).cashOperations ?? [], (input as any).cashOperations ?? [])
        : ((input as any).cashOperations ?? []);
      const teamViolationsMerged = existingData
        ? mergeArraysById((existingData as any).teamViolations ?? [], (input as any).teamViolations ?? [])
        : ((input as any).teamViolations ?? []);

      store = {
        clients,
        cars,
        sessions,
        subscriptions,
        payments,
        debts,
        transactions,
        tariffs,
        shifts,
        expenses,
        withdrawals,
        users,
        deletedClientIds,
        scheduledShifts,
        actionLogs,
        adminExpenses: adminExpensesMerged,
        adminCashOperations: adminCashOpsMerged,
        expenseCategories: expenseCatsMerged,
        dailyDebtAccruals: dailyDebtAccrualsMerged,
        clientDebts: clientDebtsMerged,
        cashOperations: cashOpsMerged,
        teamViolations: teamViolationsMerged,
      };
      version++;
      saveToDisk();
      console.log(
        `[ParkingStore] Data merged, version: ${version}, epoch: ${restoreEpoch}, clients: ${clients.length}, sessions: ${sessions.length}, users: ${users.length}`
      );
      return { version, restoreEpoch, data: getStoreDataForClient(), epochConflict: false };
    }),
});
