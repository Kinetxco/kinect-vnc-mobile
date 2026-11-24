export interface AccountStatus {
  paired: boolean;
  revoked: boolean;
  accountEmail?: string | null;
  pairNotice?: string | null;
}

export type AccountView =
  | { kind: "checking" }
  | { kind: "signed-in"; email: string | null; notice: string | null }
  | { kind: "revoked"; notice: string | null }
  | { kind: "signed-out"; notice: string | null };

function clean(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text ? text : null;
}

export function accountView(status: AccountStatus | null): AccountView {
  if (!status) return { kind: "checking" };
  const notice = clean(status.pairNotice);
  if (status.revoked) return { kind: "revoked", notice };
  if (status.paired) return { kind: "signed-in", email: clean(status.accountEmail), notice };
  return { kind: "signed-out", notice };
}

export function accountHeadline(view: AccountView): string {
  switch (view.kind) {
    case "checking":
      return "Checking sign-in…";
    case "signed-in":
      return view.email ? `Signed in as ${view.email}.` : "Signed in.";
    case "revoked":
      return "This sign-in was removed. Sign in again.";
    case "signed-out":
      return "Sign in to load the computers on this account.";
  }
}
