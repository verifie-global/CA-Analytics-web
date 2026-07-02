import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  assignCompanyUserAgents,
  createCompanyUser,
  fetchCompanyAgents,
  fetchCompanyUsers,
  resetCompanyUserPassword,
  updateCompanyUser,
  updateCompanyUserStatus,
} from "./api";
import type { AppSettings, CompanyAgent, CompanyUser } from "./types";

type Props = {
  settings: AppSettings;
  onUnauthorized: () => void;
};

type Editor = {
  mode: "create" | "edit";
  user: CompanyUser | null;
  name: string;
  email: string;
  role: "Admin" | "User";
  password: string;
  agentIds: number[];
};

const emptyEditor = (): Editor => ({
  mode: "create", user: null, name: "", email: "", role: "User", password: "", agentIds: [],
});

const formatDate = (value?: string | null) => {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
};

export function UserManagementPage({ settings, onUnauthorized }: Props) {
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [agents, setAgents] = useState<CompanyAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [agentSearch, setAgentSearch] = useState("");
  const [passwordUser, setPasswordUser] = useState<CompanyUser | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const handleError = useCallback((caught: unknown, fallback: string) => {
    const status = caught && typeof caught === "object" && "status" in caught
      ? (caught as { status?: number }).status : undefined;
    if (status === 401) {
      onUnauthorized();
      return;
    }
    setError(status === 403 ? "Permission denied. Administrator access is required." :
      caught instanceof Error ? caught.message : fallback);
  }, [onUnauthorized]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextUsers, nextAgents] = await Promise.all([
        fetchCompanyUsers(settings), fetchCompanyAgents(settings),
      ]);
      setUsers(nextUsers);
      setAgents(nextAgents.filter((agent) => agent.id > 0));
    } catch (caught) {
      handleError(caught, "Unable to load users.");
    } finally {
      setLoading(false);
    }
  }, [handleError, settings]);

  useEffect(() => { void load(); }, [load]);

  const currentUserId = String(settings.userId ?? "");
  const openEdit = (user: CompanyUser) => {
    setEditor({
      mode: "edit", user, name: user.name, email: user.email, role: user.role, password: "",
      agentIds: user.assignedAgents.map((agent) => agent.id),
    });
    setAgentSearch("");
  };

  const submitEditor = async (event: FormEvent) => {
    event.preventDefault();
    if (!editor) return;
    setError("");
    setSuccess("");
    if (!editor.name.trim() || (editor.mode === "create" && !editor.email.trim())) {
      setError("Name and email are required.");
      return;
    }
    if (editor.mode === "create" && editor.password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }
    if (editor.user && String(editor.user.id) === currentUserId && editor.role !== "Admin") {
      setError("You cannot remove your own Admin role.");
      return;
    }
    setSaving(true);
    try {
      if (editor.mode === "create") {
        const created = await createCompanyUser(settings, {
          name: editor.name.trim(), email: editor.email.trim(), role: editor.role,
          password: editor.password,
        });
        let createdId = Number(created.id);
        if (!(createdId > 0) && editor.role === "User") {
          const refreshedUsers = await fetchCompanyUsers(settings);
          createdId = refreshedUsers.find(
            (user) => user.email.toLowerCase() === editor.email.trim().toLowerCase(),
          )?.id ?? 0;
        }
        if (editor.role === "User" && createdId > 0) {
          await assignCompanyUserAgents(settings, createdId, editor.agentIds);
        }
      } else if (editor.user) {
        await updateCompanyUser(settings, editor.user.id, {
          name: editor.name.trim(), role: editor.role,
        });
        if (editor.role === "User") {
          await assignCompanyUserAgents(settings, editor.user.id, editor.agentIds);
        }
      }
      setSuccess(editor.mode === "create" ? "User created successfully." : "User updated successfully.");
      setEditor(null);
      await load();
    } catch (caught) {
      handleError(caught, "Unable to save user.");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (user: CompanyUser) => {
    if (String(user.id) === currentUserId && user.isActive) return;
    if (user.isActive && !window.confirm(`Deactivate ${user.name || user.email}?`)) return;
    setError(""); setSuccess("");
    try {
      await updateCompanyUserStatus(settings, user.id, !user.isActive);
      setSuccess(`User ${user.isActive ? "deactivated" : "activated"} successfully.`);
      await load();
    } catch (caught) { handleError(caught, "Unable to update user status."); }
  };

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!passwordUser) return;
    if (newPassword.length < 8) { setError("Password must contain at least 8 characters."); return; }
    setSaving(true); setError("");
    try {
      await resetCompanyUserPassword(settings, passwordUser.id, newPassword);
      setSuccess("Password reset successfully.");
      setPasswordUser(null); setNewPassword("");
    } catch (caught) { handleError(caught, "Unable to reset password."); }
    finally { setSaving(false); }
  };

  const visibleAgents = agents.filter((agent) =>
    `${agent.name} ${agent.externalId ?? ""}`.toLowerCase().includes(agentSearch.toLowerCase()));

  return (
    <section className="panel user-management">
      <div className="section-heading user-management-heading">
        <div><h1>User Management</h1><p>Create users, control access, and assign visible agents.</p></div>
        <button type="button" onClick={() => setEditor(emptyEditor())}>Create user</button>
      </div>
      <div className="assignment-notice" role="note">
        Users with no assigned agents cannot see any call data. Admin users automatically have unrestricted access.
      </div>
      {error ? <div className="form-message error-message" role="alert">{error}</div> : null}
      {success ? <div className="form-message success-message" role="status">{success}</div> : null}
      {loading ? <div className="empty-state"><p>Loading users…</p></div> :
        users.length === 0 ? <div className="empty-state"><h3>No users found</h3><p>Create the first user for this company.</p></div> :
        <div className="user-table-wrap">
          <table className="user-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Assigned agents</th><th>Created</th><th>Last login</th><th>Actions</th></tr></thead>
            <tbody>{users.map((user) => {
              const isSelf = String(user.id) === currentUserId;
              return <tr key={user.id}>
                <td data-label="Name">{user.name || "—"}{isSelf ? <small className="self-label">You</small> : null}</td>
                <td data-label="Email">{user.email}</td><td data-label="Role">{user.role}</td>
                <td data-label="Status"><span className={`status-badge ${user.isActive ? "status-active" : "status-inactive"}`}>{user.isActive ? "Active" : "Inactive"}</span></td>
                <td data-label="Assigned agents">{user.role === "Admin" ? "All agents" : user.assignedAgents.length ? user.assignedAgents.map((agent) => agent.name).join(", ") : "None"}</td>
                <td data-label="Created">{formatDate(user.createdUtc)}</td><td data-label="Last login">{formatDate(user.lastLoginUtc)}</td>
                <td data-label="Actions"><div className="user-actions">
                  <button type="button" className="secondary-button small-button" onClick={() => openEdit(user)}>Edit</button>
                  <button type="button" className="secondary-button small-button" onClick={() => { setPasswordUser(user); setNewPassword(""); }}>Reset password</button>
                  <button type="button" className="secondary-button small-button" disabled={isSelf && user.isActive} title={isSelf && user.isActive ? "You cannot deactivate yourself" : undefined} onClick={() => void toggleStatus(user)}>{user.isActive ? "Deactivate" : "Activate"}</button>
                </div></td>
              </tr>;
            })}</tbody>
          </table>
        </div>}

      {editor ? <div className="modal-backdrop" role="presentation">
        <section className="modal-card user-modal" role="dialog" aria-modal="true" aria-labelledby="user-editor-title">
          <div className="modal-heading"><h2 id="user-editor-title">{editor.mode === "create" ? "Create user" : "Edit user"}</h2><button type="button" className="modal-close" onClick={() => setEditor(null)} aria-label="Close">×</button></div>
          <form className="grid-form" onSubmit={submitEditor}>
            <label>Name<input value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} required /></label>
            <label>Email<input type="email" value={editor.email} onChange={(e) => setEditor({ ...editor, email: e.target.value })} disabled={editor.mode === "edit"} required /></label>
            <label>Role<select value={editor.role} onChange={(e) => setEditor({ ...editor, role: e.target.value as "Admin" | "User" })}><option value="User">User</option><option value="Admin">Admin</option></select></label>
            {editor.mode === "create" ? <label>Password<input type="password" minLength={8} value={editor.password} onChange={(e) => setEditor({ ...editor, password: e.target.value })} required /><small>At least 8 characters</small></label> : null}
            {editor.role === "User" ? <fieldset className="agent-picker full-width"><legend>Assigned agents</legend>
              <input type="search" placeholder="Search agents" aria-label="Search agents" value={agentSearch} onChange={(e) => setAgentSearch(e.target.value)} />
              <div className="agent-options">{visibleAgents.length ? visibleAgents.map((agent) => <label key={agent.id}><input type="checkbox" checked={editor.agentIds.includes(agent.id)} onChange={(e) => setEditor({ ...editor, agentIds: e.target.checked ? [...editor.agentIds, agent.id] : editor.agentIds.filter((id) => id !== agent.id) })} /><span>{agent.name}{agent.externalId ? ` — ${agent.externalId}` : ""}</span></label>) : <p>No matching agents.</p>}</div>
              <small>No assigned agents means this user cannot see call data.</small>
            </fieldset> : <div className="assignment-notice full-width">Admins have unrestricted access to all agents.</div>}
            <div className="modal-actions full-width"><button type="button" className="secondary-button" onClick={() => setEditor(null)}>Cancel</button><button type="submit" disabled={saving}>{saving ? "Saving…" : "Save user"}</button></div>
          </form>
        </section>
      </div> : null}

      {passwordUser ? <div className="modal-backdrop" role="presentation"><section className="modal-card user-modal" role="dialog" aria-modal="true" aria-labelledby="password-title">
        <div className="modal-heading"><h2 id="password-title">Reset password</h2><button type="button" className="modal-close" onClick={() => setPasswordUser(null)} aria-label="Close">×</button></div>
        <form className="grid-form" onSubmit={submitPassword}><label className="full-width">New password for {passwordUser.name}<input type="password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /><small>At least 8 characters</small></label>
          <div className="modal-actions full-width"><button type="button" className="secondary-button" onClick={() => setPasswordUser(null)}>Cancel</button><button type="submit" disabled={saving}>{saving ? "Resetting…" : "Reset password"}</button></div>
        </form></section></div> : null}
    </section>
  );
}
