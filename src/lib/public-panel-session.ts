type Result = { error: unknown };
type PanelAuth = {
  signInWithPassword: (credentials: { email: string; password: string }) => Promise<Result & { data: { session: unknown } }>;
  signOut: () => Promise<Result>;
  getUser: () => Promise<Result & { data: { user: unknown } }>;
};
type SessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type QueryCache = { cancelQueries: () => Promise<unknown>; clear: () => void };
const SESSION_MARK = "public_admin_session";

export async function signInPublicPanel(auth: Pick<PanelAuth, "signInWithPassword">, storage: SessionStorage, email: string, password: string) {
  storage.removeItem(SESSION_MARK);
  const { data, error } = await auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  if (!data.session) throw new Error("Não foi possível iniciar a sessão.");
  storage.setItem(SESSION_MARK, "true");
}

export async function hasPublicPanelSession(auth: Pick<PanelAuth, "getUser">, storage: SessionStorage) {
  if (storage.getItem(SESSION_MARK) !== "true") return false;
  const { data, error } = await auth.getUser();
  if (error || !data.user) {
    storage.removeItem(SESSION_MARK);
    return false;
  }
  return true;
}

export async function signOutPublicPanel(auth: Pick<PanelAuth, "signOut">, storage: SessionStorage, cache: QueryCache) {
  await cache.cancelQueries();
  cache.clear();
  const { error } = await auth.signOut();
  if (error) throw error;
  storage.removeItem(SESSION_MARK);
}