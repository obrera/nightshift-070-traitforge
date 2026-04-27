import {
  type UiWallet,
  type UiWalletAccount,
  useWalletUi,
  useWalletUiSigner,
  useWalletUiWallet
} from "@wallet-ui/react";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type FormEvent
} from "react";
import type {
  AnalyticsResponse,
  CollectionSchema,
  CollectionSchemaResponse,
  ConfirmMintRequest,
  CreateMintResponse,
  DashboardResponse,
  DraftRecord,
  DraftViewResponse,
  MetadataDiffResponse,
  MintQuoteResponse,
  PrepareMintRequest,
  PrepareMintResponse,
  RenderDraftResponse,
  SaveDraftResponse,
  TraitSelection,
  UserSummary
} from "../shared/contracts";
import { executeWalletMint } from "./execute-wallet-mint";
import { lamportsToSol } from "../shared/mpl";

type AppView = "forge" | "library" | "admin";
type AuthMode = "login" | "register";

interface AuthFormState {
  username: string;
  password: string;
  displayName: string;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed.");
  }
  return data;
}

function formatUtc(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function initialViewFromPath(pathname: string): AppView {
  if (pathname === "/admin") {
    return "admin";
  }
  if (pathname === "/library") {
    return "library";
  }
  return "forge";
}

function draftShareFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/drafts\/([^/]+)$/);
  return match?.[1] ?? null;
}

function shortAddress(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 4)}...${value.slice(-4)}`;
}

type WalletSigner = ReturnType<typeof useWalletUiSigner>;

function WalletConnectOption({
  disabled,
  wallet
}: {
  disabled: boolean;
  wallet: UiWallet;
}) {
  const { connect, isConnecting } = useWalletUiWallet({ wallet });

  return (
    <button
      className="ghost-button wallet-option"
      disabled={disabled || isConnecting}
      onClick={() => void connect()}
      type="button"
    >
      {isConnecting ? `Connecting ${wallet.name}...` : `Connect ${wallet.name}`}
    </button>
  );
}

function MintActionButton({
  account,
  disabled,
  isBusy,
  onMint
}: {
  account: UiWalletAccount;
  disabled: boolean;
  isBusy: boolean;
  onMint: (args: { account: UiWalletAccount; walletSigner: WalletSigner }) => Promise<void>;
}) {
  const walletSigner = useWalletUiSigner({ account });

  return (
    <button
      className="ghost-button action-cta"
      disabled={disabled}
      onClick={() => void onMint({ account, walletSigner })}
      type="button"
    >
      {isBusy ? "Minting..." : "Mint From Connected Wallet"}
    </button>
  );
}

export function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [view, setView] = useState<AppView>(initialViewFromPath(window.location.pathname));
  const [bootstrap, setBootstrap] = useState<DashboardResponse | null>(null);
  const [schema, setSchema] = useState<CollectionSchemaResponse | null>(null);
  const [selectedCollectionSlug, setSelectedCollectionSlug] = useState("");
  const [draftTitle, setDraftTitle] = useState("Night Shift Operator");
  const [selections, setSelections] = useState<TraitSelection>({});
  const [rendered, setRendered] = useState<RenderDraftResponse | null>(null);
  const [quoted, setQuoted] = useState<MintQuoteResponse | null>(null);
  const [sharedDraft, setSharedDraft] = useState<DraftViewResponse | null>(null);
  const [activeDraftId, setActiveDraftId] = useState<string | undefined>();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authForm, setAuthForm] = useState<AuthFormState>({
    username: "obrera",
    password: "nightshift070!",
    displayName: ""
  });
  const [adminSchema, setAdminSchema] = useState<CollectionSchema | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [diffResult, setDiffResult] = useState<MetadataDiffResponse | null>(null);
  const [compareDraftId, setCompareDraftId] = useState("");
  const initKeyRef = useRef("");

  const { account, cluster, disconnect, wallet, wallets } = useWalletUi();
  const deferredSelections = useDeferredValue(selections);
  const connectedWalletAddress = account?.address ?? "";
  const currentUser = bootstrap?.session.user ?? null;
  const isOperator = currentUser?.role === "operator";
  const drafts = bootstrap?.drafts ?? [];
  const activity = bootstrap?.activity ?? [];
  const sharedDraftId = draftShareFromPath(path);

  async function refreshBootstrap() {
    const next = await api<DashboardResponse>("/api/bootstrap");
    setBootstrap(next);
    if (!selectedCollectionSlug && next.collections[0]) {
      setSelectedCollectionSlug(next.collections[0].slug);
    }
  }

  function navigate(nextPath: string, nextView = initialViewFromPath(nextPath)) {
    window.history.pushState({}, "", nextPath);
    setPath(nextPath);
    setView(nextView);
  }

  useEffect(() => {
    void refreshBootstrap().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Failed to load TraitForge.");
    });

    const onPopState = () => {
      setPath(window.location.pathname);
      setView(initialViewFromPath(window.location.pathname));
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!sharedDraftId) {
      setSharedDraft(null);
      return;
    }

    void api<DraftViewResponse>(`/api/drafts/${sharedDraftId}`)
      .then((data) => {
        setSharedDraft(data);
        setActiveDraftId(data.draft.id);
        setSelectedCollectionSlug(data.draft.collectionSlug);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Failed to load shared draft.");
      });
  }, [sharedDraftId]);

  useEffect(() => {
    if (!bootstrap || selectedCollectionSlug) {
      return;
    }

    if (sharedDraft?.draft.collectionSlug) {
      setSelectedCollectionSlug(sharedDraft.draft.collectionSlug);
      return;
    }

    if (bootstrap.collections[0]) {
      setSelectedCollectionSlug(bootstrap.collections[0].slug);
    }
  }, [bootstrap, selectedCollectionSlug, sharedDraft]);

  useEffect(() => {
    if (!selectedCollectionSlug) {
      return;
    }

    void api<CollectionSchemaResponse>(`/api/collections/${selectedCollectionSlug}/schema`)
      .then((data) => {
        setSchema(data);
        setAdminSchema(JSON.parse(JSON.stringify(data.collection)) as CollectionSchema);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Failed to load collection schema.");
      });
  }, [selectedCollectionSlug]);

  useEffect(() => {
    const collection = schema?.collection;
    if (!collection) {
      return;
    }

    const draft = sharedDraft?.draft.collectionSlug === collection.slug ? sharedDraft.draft : undefined;
    const initKey = `${collection.slug}:${draft?.id ?? "default"}`;
    if (initKeyRef.current === initKey) {
      return;
    }

    initKeyRef.current = initKey;
    setQuoted(null);
    setDiffResult(null);
    setCompareDraftId("");
    if (draft) {
      setSelections(draft.selections);
      setDraftTitle(draft.title);
      setActiveDraftId(draft.id);
    } else {
      setSelections(collection.defaultTraitSelection);
      setDraftTitle(`Forge ${collection.name}`);
      setActiveDraftId(undefined);
    }
  }, [schema, sharedDraft]);

  useEffect(() => {
    if (!schema?.collection) {
      return;
    }

    const controller = new AbortController();
    setError(null);
    setQuoted(null);

    void api<RenderDraftResponse>("/api/drafts/render", {
      method: "POST",
      body: JSON.stringify({
        collectionSlug: schema.collection.slug,
        selections: deferredSelections,
        name: draftTitle
      }),
      signal: controller.signal
    })
      .then((data) => setRendered(data))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }
        setError(reason instanceof Error ? reason.message : "Preview render failed.");
      });

    return () => controller.abort();
  }, [schema, deferredSelections, draftTitle]);

  useEffect(() => {
    if (!isOperator || view !== "admin" || !selectedCollectionSlug) {
      return;
    }

    void api<AnalyticsResponse>(`/api/admin/collections/${selectedCollectionSlug}/analytics`)
      .then(setAnalytics)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Failed to load analytics.");
      });
  }, [isOperator, view, selectedCollectionSlug]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyKey("auth");
    setError(null);
    setNotice(null);
    try {
      const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      await api<{ user: UserSummary }>(endpoint, {
        method: "POST",
        body: JSON.stringify(authForm)
      });
      await refreshBootstrap();
      setNotice(
        authMode === "login"
          ? `Signed in as ${authForm.username}.`
          : `Account created for ${authForm.username}.`
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Authentication failed.");
    } finally {
      setBusyKey(null);
    }
  }

  async function logout() {
    setBusyKey("logout");
    try {
      await api("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
      await refreshBootstrap();
      setNotice("Logged out.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Logout failed.");
    } finally {
      setBusyKey(null);
    }
  }

  async function quoteMint() {
    if (!schema?.collection) {
      return;
    }

    setBusyKey("quote");
    setError(null);
    try {
      const next = await api<MintQuoteResponse>("/api/mints/quote", {
        method: "POST",
        body: JSON.stringify({
          collectionSlug: schema.collection.slug,
          selections,
          name: draftTitle
        })
      });
      setQuoted(next);
      setStep(3);
      setNotice("Mint quote refreshed.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Quote failed.");
    } finally {
      setBusyKey(null);
    }
  }

  async function saveDraft() {
    if (!schema?.collection) {
      return;
    }

    setBusyKey("save");
    setError(null);
    try {
      const next = await api<SaveDraftResponse>("/api/drafts", {
        method: "POST",
        body: JSON.stringify({
          draftId: activeDraftId,
          collectionSlug: schema.collection.slug,
          selections,
          title: draftTitle
        })
      });
      setActiveDraftId(next.draft.id);
      await refreshBootstrap();
      navigate(`/drafts/${next.draft.shareId}`, "forge");
      setSharedDraft({
        draft: next.draft
      });
      setNotice(`Saved draft link /drafts/${next.draft.shareId}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Save failed.");
    } finally {
      setBusyKey(null);
    }
  }

  async function createMint({
    account,
    walletSigner
  }: {
    account: UiWalletAccount;
    walletSigner: WalletSigner;
  }) {
    if (!schema?.collection) {
      return;
    }

    const mintSelections = { ...selections };
    const mintName = draftTitle;
    const preparePayload: PrepareMintRequest = {
      draftId: activeDraftId,
      collectionSlug: schema.collection.slug,
      selections: mintSelections,
      name: mintName,
      recipientOwnerAddress: account.address
    };

    setBusyKey("mint");
    setError(null);
    try {
      const prepared = await api<PrepareMintResponse>("/api/mints/prepare", {
        method: "POST",
        body: JSON.stringify(preparePayload)
      });
      setQuoted(prepared);

      const submitted = await executeWalletMint({
        collectionName: schema.collection.name,
        mintPlan: prepared.plan,
        rpcUrl: cluster.url,
        walletSigner
      });

      const next = await api<CreateMintResponse>("/api/mints/confirm", {
        method: "POST",
        body: JSON.stringify({
          ...preparePayload,
          assetAddress: submitted.assetAddress,
          assetId: prepared.plan.assetId,
          collectionAddress: submitted.collectionAddress,
          signature: submitted.signature
        } satisfies ConfirmMintRequest)
      });
      await refreshBootstrap();
      setNotice(
        `Devnet mint confirmed: ${shortAddress(next.mint.assetAddress)} → ${shortAddress(
          next.mint.recipientOwnerAddress
        )}`
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Devnet mint failed.");
    } finally {
      setBusyKey(null);
    }
  }

  async function saveSchema() {
    if (!adminSchema) {
      return;
    }

    setBusyKey("schema");
    setError(null);
    try {
      await api(`/api/admin/collections/${adminSchema.slug}/schema`, {
        method: "PUT",
        body: JSON.stringify({ collection: adminSchema })
      });
      await refreshBootstrap();
      setSelectedCollectionSlug(adminSchema.slug);
      setNotice(`Schema updated for ${adminSchema.name}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Schema update failed.");
    } finally {
      setBusyKey(null);
    }
  }

  async function runMetadataDiff() {
    if (!schema?.collection || !compareDraftId) {
      return;
    }

    const compareDraft = drafts.find((entry) => entry.id === compareDraftId);
    if (!compareDraft) {
      return;
    }

    setBusyKey("diff");
    try {
      const next = await api<MetadataDiffResponse>(
        `/api/admin/collections/${schema.collection.slug}/metadata-diff`,
        {
          method: "POST",
          body: JSON.stringify({
            base: compareDraft.selections,
            compare: selections
          })
        }
      );
      setDiffResult(next);
      setNotice("Metadata diff updated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Metadata diff failed.");
    } finally {
      setBusyKey(null);
    }
  }

  function setSelection(slotId: string, valueId: string) {
    startTransition(() => {
      setSelections((current) => ({
        ...current,
        [slotId]: valueId
      }));
    });
  }

  const collection = schema?.collection;
  const preview = rendered?.preview ?? quoted?.preview;
  const rarity = quoted?.rarity ?? rendered?.rarity;
  const conflicts = quoted?.conflicts ?? rendered?.conflicts ?? [];
  const usageMap = new Map(
    (rendered?.usage ?? schema?.usage ?? []).map((entry) => [
      `${entry.slotId}:${entry.valueId}`,
      entry
    ])
  );

  return (
    <div className="app-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <header className="topbar">
        <div>
          <p className="eyebrow">Nightshift Build 070</p>
          <h1>TraitForge</h1>
          <p className="subtitle">
            Wizard-first MPL Core collectible builder with server-authored caps,
            conflicts, rarity pressure, and wallet-signed devnet MPL Core mints.
          </p>
        </div>
        <div className="topbar-actions">
          <button
            className={`ghost-button ${view === "forge" ? "active" : ""}`}
            onClick={() => navigate("/", "forge")}
          >
            Forge
          </button>
          <button
            className={`ghost-button ${view === "library" ? "active" : ""}`}
            onClick={() => navigate("/library", "library")}
          >
            Drafts
          </button>
          {isOperator ? (
            <button
              className={`ghost-button ${view === "admin" ? "active" : ""}`}
              onClick={() => navigate("/admin", "admin")}
            >
              Schema Lab
            </button>
          ) : null}
        </div>
      </header>

      {(notice || error) && (
        <div className={`banner ${error ? "error" : "notice"}`}>
          {error ?? notice}
        </div>
      )}

      <main className="workspace">
        <aside className="rail rail-left">
          <section className="panel step-panel">
            <p className="eyebrow">Wizard Path</p>
            <button className={`step-button ${step === 1 ? "active" : ""}`} onClick={() => setStep(1)}>
              <span>01</span>
              <div>
                <strong>Choose Collection</strong>
                <small>Select a server-defined MPL Core schema.</small>
              </div>
            </button>
            <button className={`step-button ${step === 2 ? "active" : ""}`} onClick={() => setStep(2)}>
              <span>02</span>
              <div>
                <strong>Compose Traits</strong>
                <small>Layer slots, inspect caps, and resolve conflicts.</small>
              </div>
            </button>
            <button className={`step-button ${step === 3 ? "active" : ""}`} onClick={() => setStep(3)}>
              <span>03</span>
              <div>
                <strong>Review & Mint</strong>
                <small>Quote, save a draft link, or mint from a connected devnet wallet.</small>
              </div>
            </button>
          </section>

          <section className="panel wallet-panel">
            <p className="eyebrow">Wallet</p>
            {account ? (
              <>
                <h3>{wallet?.name ?? "Connected Wallet"}</h3>
                <p className="muted">
                  {shortAddress(connectedWalletAddress)} · devnet
                </p>
                <div className="wallet-card">
                  <strong>Mint authority</strong>
                  <span>
                    The connected wallet pays the devnet fees, signs the mint, and receives
                    the asset.
                  </span>
                </div>
                <button
                  className="ghost-button"
                  disabled={busyKey === "mint"}
                  onClick={() => disconnect()}
                  type="button"
                >
                  Disconnect Wallet
                </button>
              </>
            ) : wallets.length > 0 ? (
              <div className="stack">
                <p className="muted">
                  Connect a Solana wallet to pay for the mint and take ownership on devnet.
                </p>
                <div className="wallet-options">
                  {wallets.map((availableWallet) => (
                    <WalletConnectOption
                      key={availableWallet.name}
                      disabled={busyKey === "mint"}
                      wallet={availableWallet}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <p className="muted">
                No Solana wallet was detected. Install a wallet that supports the Solana
                Wallet Standard, then refresh.
              </p>
            )}
          </section>

          <section className="panel auth-panel">
            <p className="eyebrow">Identity</p>
            {currentUser ? (
              <>
                <h3>{currentUser.displayName}</h3>
                <p className="muted">
                  @{currentUser.username} · {currentUser.role}
                </p>
                <button className="primary-button" onClick={() => void logout()} disabled={busyKey === "logout"}>
                  {busyKey === "logout" ? "Logging out..." : "Log Out"}
                </button>
              </>
            ) : (
              <>
                <div className="auth-tabs">
                  <button
                    className={authMode === "login" ? "active" : ""}
                    onClick={() => setAuthMode("login")}
                  >
                    Login
                  </button>
                  <button
                    className={authMode === "register" ? "active" : ""}
                    onClick={() => setAuthMode("register")}
                  >
                    Register
                  </button>
                </div>
                <form className="auth-form" onSubmit={(event) => void submitAuth(event)}>
                  <input
                    value={authForm.username}
                    onChange={(event) =>
                      setAuthForm((current) => ({
                        ...current,
                        username: event.target.value
                      }))
                    }
                    placeholder="username"
                  />
                  <input
                    type="password"
                    value={authForm.password}
                    onChange={(event) =>
                      setAuthForm((current) => ({
                        ...current,
                        password: event.target.value
                      }))
                    }
                    placeholder="password"
                  />
                  {authMode === "register" ? (
                    <input
                      value={authForm.displayName}
                      onChange={(event) =>
                        setAuthForm((current) => ({
                          ...current,
                          displayName: event.target.value
                        }))
                      }
                      placeholder="display name"
                    />
                  ) : null}
                  <button className="primary-button" disabled={busyKey === "auth"}>
                    {busyKey === "auth"
                      ? "Working..."
                      : authMode === "login"
                        ? "Sign In"
                        : "Create Account"}
                  </button>
                </form>
                <p className="muted seed-note">
                  Seed operator: `obrera` / `nightshift070!`
                </p>
              </>
            )}
          </section>
        </aside>

        <section className="center-stage">
          {view === "forge" && collection ? (
            <>
              <section className="panel hero-panel">
                <div className="hero-copy">
                  <p className="eyebrow">Collection</p>
                  <div className="hero-row">
                    <div>
                      <h2>{collection.name}</h2>
                      <p>{collection.description}</p>
                    </div>
                    <select
                      className="collection-select"
                      value={selectedCollectionSlug}
                      onChange={(event) => {
                        initKeyRef.current = "";
                        setSelectedCollectionSlug(event.target.value);
                        navigate("/", "forge");
                      }}
                    >
                      {bootstrap?.collections.map((entry) => (
                        <option key={entry.slug} value={entry.slug}>
                          {entry.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="hero-stats">
                  <div>
                    <strong>{collection.targetSupply}</strong>
                    <span>Target Supply</span>
                  </div>
                  <div>
                    <strong>{collection.mintedCount}</strong>
                    <span>Minted</span>
                  </div>
                  <div>
                    <strong>{collection.slots.length}</strong>
                    <span>Trait Slots</span>
                  </div>
                </div>
              </section>

              <section className="forge-grid">
                <div className="panel forge-form">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">Draft Identity</p>
                      <h3>Compose a collectible</h3>
                    </div>
                    <input
                      className="title-input"
                      value={draftTitle}
                      onChange={(event) => setDraftTitle(event.target.value)}
                    />
                  </div>

                  {step === 1 ? (
                    <div className="stack">
                      <p className="muted">
                        TraitForge starts from a server-defined collection schema. This collection
                        already carries slot ordering, rarity weights, hard supply caps, and
                        authored conflicts.
                      </p>
                      <div className="collection-note">
                        <strong>{collection.themeNote}</strong>
                        <span>MPL Core collection key: {collection.collectionKey}</span>
                        {collection.devnetCollection ? (
                          <span>Devnet collection: {shortAddress(collection.devnetCollection.address)}</span>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="trait-stack">
                      {collection.slots.map((slot) => (
                        <div className="trait-block" key={slot.id}>
                          <div className="trait-head">
                            <div>
                              <p className="eyebrow">{slot.label}</p>
                              <h4>{slot.description}</h4>
                            </div>
                          </div>
                          <div className="trait-options">
                            {slot.values.map((value) => {
                              const selected = selections[slot.id] === value.id;
                              const usage = usageMap.get(`${slot.id}:${value.id}`);
                              return (
                                <button
                                  key={value.id}
                                  className={`trait-option ${selected ? "selected" : ""}`}
                                  onClick={() => setSelection(slot.id, value.id)}
                                >
                                  <div className="swatch" style={{ background: value.preview.accent }} />
                                  <div>
                                    <strong>{value.label}</strong>
                                    <span>{value.description}</span>
                                  </div>
                                  <small>
                                    cap {value.supplyCap} · left {usage?.remaining ?? value.supplyCap}
                                  </small>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="panel action-panel">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">Actions</p>
                      <h3>Review, save, mint</h3>
                    </div>
                  </div>
                  <div className="action-row">
                    <button className="primary-button" onClick={() => void quoteMint()} disabled={busyKey === "quote"}>
                      {busyKey === "quote" ? "Quoting..." : "Refresh Mint Quote"}
                    </button>
                    <button className="ghost-button action-cta" onClick={() => void saveDraft()} disabled={busyKey === "save"}>
                      {busyKey === "save" ? "Saving..." : "Save Draft Link"}
                    </button>
                    {account ? (
                      <MintActionButton
                        account={account}
                        disabled={
                          busyKey === "mint" ||
                          conflicts.length > 0 ||
                          !currentUser
                        }
                        isBusy={busyKey === "mint"}
                        onMint={createMint}
                      />
                    ) : (
                      <button className="ghost-button action-cta" disabled type="button">
                        {currentUser ? "Connect Wallet To Mint" : "Sign In To Mint"}
                      </button>
                    )}
                  </div>
                  <div className="stack">
                    <strong>Mint Wallet</strong>
                    <div className="wallet-card">
                      {account ? (
                        <>
                          <strong>{wallet?.name ?? "Connected Wallet"}</strong>
                          <span>{connectedWalletAddress}</span>
                        </>
                      ) : (
                        <>
                          <strong>Wallet not connected</strong>
                          <span>Connect a Solana wallet before submitting a devnet mint.</span>
                        </>
                      )}
                    </div>
                    <small className="muted">
                      Wallet-signed mints use the connected wallet as payer, signer, and owner.
                      {currentUser ? "" : " A TraitForge account is still required so mint history can be saved."}
                    </small>
                  </div>
                  {sharedDraftId ? (
                    <p className="muted">Shareable route: /drafts/{sharedDraftId}</p>
                  ) : null}
                  {quoted ? (
                    <div className="quote-box">
                      <strong>{quoted.quote.sol.toFixed(4)} SOL</strong>
                      <span>{quoted.quote.lamports.toLocaleString()} lamports</span>
                      <ul>
                        {quoted.quote.breakdown.map((entry) => (
                          <li key={entry.label}>
                            <span>{entry.label}</span>
                            <strong>{lamportsToSol(entry.lamports).toFixed(4)} SOL</strong>
                          </li>
                        ))}
                      </ul>
                      {quoted.warnings.map((warning) => (
                        <p className="warning-line" key={warning}>
                          {warning}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">
                      Quote the build to estimate the real devnet mint cost before submitting.
                    </p>
                  )}
                </div>
              </section>
            </>
          ) : null}

          {view === "library" ? (
            <section className="panel library-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Saved Work</p>
                  <h2>Draft links and mint history</h2>
                </div>
              </div>
              <div className="library-grid">
                <div>
                  <h3>Your drafts</h3>
                  <div className="stack">
                    {drafts.map((draft) => (
                      <button
                        key={draft.id}
                        className="library-item"
                        onClick={() => {
                          setSharedDraft({ draft });
                          setActiveDraftId(draft.id);
                          setSelectedCollectionSlug(draft.collectionSlug);
                          navigate(`/drafts/${draft.shareId}`, "forge");
                        }}
                      >
                        <strong>{draft.title}</strong>
                        <span>
                          {draft.rarity.label} · {draft.rarity.percentile}p · updated{" "}
                          {formatUtc(draft.updatedAt)}
                        </span>
                      </button>
                    ))}
                    {drafts.length === 0 ? (
                      <p className="muted">Sign in to save drafts and generate persistent share links.</p>
                    ) : null}
                  </div>
                </div>
                <div>
                  <h3>Recent devnet mints</h3>
                  <div className="stack">
                    {bootstrap?.mints.map((mint) => (
                      <div className="mint-item" key={mint.id}>
                        <strong>{shortAddress(mint.assetAddress)}</strong>
                        <span>
                          {mint.collectionSlug} · owner {shortAddress(mint.recipientOwnerAddress)}
                        </span>
                        <small>
                          {mint.status} · {mint.quote.sol.toFixed(4)} SOL · {formatUtc(mint.createdAt)}
                        </small>
                        <small>
                          <a href={mint.explorerUrls.asset} target="_blank" rel="noreferrer">
                            asset
                          </a>{" "}
                          ·{" "}
                          <a href={mint.explorerUrls.transaction} target="_blank" rel="noreferrer">
                            tx
                          </a>{" "}
                          ·{" "}
                          <a href={mint.explorerUrls.collection} target="_blank" rel="noreferrer">
                            collection
                          </a>
                        </small>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {view === "admin" && isOperator && adminSchema ? (
            <section className="panel admin-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Operator Surface</p>
                  <h2>Schema lab</h2>
                </div>
                <button className="primary-button" onClick={() => void saveSchema()} disabled={busyKey === "schema"}>
                  {busyKey === "schema" ? "Saving..." : "Persist Schema"}
                </button>
              </div>

              <div className="admin-grid">
                <div className="admin-section">
                  <h3>Trait schema editor</h3>
                  <div className="stack">
                    {adminSchema.slots.map((slot, slotIndex) => (
                      <div className="schema-slot" key={slot.id}>
                        <div className="schema-head">
                          <strong>{slot.label}</strong>
                          <span>{slot.description}</span>
                        </div>
                        {slot.values.map((value, valueIndex) => (
                          <div className="schema-row" key={value.id}>
                            <div>
                              <strong>{value.label}</strong>
                              <small>{value.description}</small>
                            </div>
                            <label>
                              cap
                              <input
                                type="number"
                                min={1}
                                value={value.supplyCap}
                                onChange={(event) => {
                                  const next = Number(event.target.value);
                                  setAdminSchema((current) => {
                                    if (!current) {
                                      return current;
                                    }
                                    const clone = JSON.parse(JSON.stringify(current)) as CollectionSchema;
                                    clone.slots[slotIndex].values[valueIndex].supplyCap = next;
                                    return clone;
                                  });
                                }}
                              />
                            </label>
                            <label>
                              weight
                              <input
                                type="number"
                                min={0.5}
                                step={0.1}
                                value={value.rarityWeight}
                                onChange={(event) => {
                                  const next = Number(event.target.value);
                                  setAdminSchema((current) => {
                                    if (!current) {
                                      return current;
                                    }
                                    const clone = JSON.parse(JSON.stringify(current)) as CollectionSchema;
                                    clone.slots[slotIndex].values[valueIndex].rarityWeight = next;
                                    return clone;
                                  });
                                }}
                              />
                            </label>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="admin-section">
                  <h3>Rarity distribution inspector</h3>
                  <div className="stack">
                    {analytics?.rarityBuckets.map((bucket) => (
                      <div className="bucket-row" key={bucket.label}>
                        <span>{bucket.label}</span>
                        <div className="bucket-bar">
                          <div
                            style={{
                              width: `${Math.max(8, bucket.count * 24)}px`
                            }}
                          />
                        </div>
                        <strong>{bucket.count}</strong>
                      </div>
                    ))}
                  </div>
                  <h3>Supply caps per trait</h3>
                  <div className="usage-grid">
                    {analytics?.usage.map((entry) => (
                      <div className="usage-row" key={`${entry.slotId}:${entry.valueId}`}>
                        <span>{entry.valueLabel}</span>
                        <small>
                          {entry.used}/{entry.cap} minted
                        </small>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="admin-section">
                  <h3>Metadata preview diff</h3>
                  <div className="diff-controls">
                    <select value={compareDraftId} onChange={(event) => setCompareDraftId(event.target.value)}>
                      <option value="">Select baseline draft</option>
                      {drafts.map((draft) => (
                        <option key={draft.id} value={draft.id}>
                          {draft.title}
                        </option>
                      ))}
                    </select>
                    <button className="ghost-button action-cta" onClick={() => void runMetadataDiff()} disabled={!compareDraftId || busyKey === "diff"}>
                      {busyKey === "diff" ? "Comparing..." : "Run Diff"}
                    </button>
                  </div>
                  {diffResult ? (
                    <div className="diff-panel">
                      {diffResult.changedAttributes.map((entry) => (
                        <div className="diff-row" key={entry.slotId}>
                          <strong>{entry.trait}</strong>
                          <span>
                            {entry.before} → {entry.after}
                          </span>
                        </div>
                      ))}
                      <pre>{JSON.stringify(diffResult.compareMetadata.attributes, null, 2)}</pre>
                    </div>
                  ) : (
                    <p className="muted">
                      Compare the current wizard state against a saved draft to inspect
                      metadata drift before updating caps or slot weights.
                    </p>
                  )}
                </div>
              </div>
            </section>
          ) : null}
        </section>

        <aside className="rail rail-right">
          <section className="panel preview-panel">
            <p className="eyebrow">Layered Preview</p>
            <div className="preview-frame">
              {preview ? (
                <img src={preview.dataUri} alt="TraitForge preview" />
              ) : (
                <div className="preview-empty">Rendering preview...</div>
              )}
            </div>
          </section>

          <section className="panel rarity-panel">
            <p className="eyebrow">Validator</p>
            <div className="meter">
              <div className="meter-fill" style={{ width: `${rarity?.percentile ?? 0}%` }} />
            </div>
            <div className="rarity-stats">
              <strong>{rarity?.label ?? "Pending"}</strong>
              <span>{rarity?.percentile ?? 0}th percentile</span>
            </div>
            <div className="stack">
              {rarity?.breakdown.map((entry) => (
                <div className="rarity-row" key={entry.slotId}>
                  <span>{entry.slotLabel}</span>
                  <small>
                    {entry.valueLabel} · {entry.contribution.toFixed(1)}
                  </small>
                </div>
              ))}
            </div>
            <div className="conflict-panel">
              <strong>{conflicts.length === 0 ? "No conflicts detected" : `${conflicts.length} conflict(s)`}</strong>
              {conflicts.length === 0 ? (
                <p className="muted">
                  This trait stack is currently mint-safe within the authored rules.
                </p>
              ) : (
                conflicts.map((conflict) => (
                  <p className="warning-line" key={`${conflict.slotId}:${conflict.valueId}`}>
                    {conflict.valueLabel}: {conflict.reason}
                  </p>
                ))
              )}
            </div>
          </section>

          <section className="panel activity-panel">
            <p className="eyebrow">Live Activity</p>
            <div className="stack">
              {activity.map((entry) => (
                <div className="activity-item" key={entry.id}>
                  <div className="activity-head">
                    <strong>{entry.actorDisplayName}</strong>
                    <span>{entry.scope}</span>
                  </div>
                  <p>{entry.message}</p>
                  <small>{formatUtc(entry.createdAt)}</small>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}
