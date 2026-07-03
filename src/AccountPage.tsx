import { useState, type FormEvent } from "react";
import { changePassword } from "./api";
import type { AppSettings } from "./types";

type Props = { settings: AppSettings; onUnauthorized: () => void };
type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  autoComplete: "current-password" | "new-password";
  visible: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
};

function PasswordField(props: PasswordFieldProps) {
  return (
    <label className="full-width" htmlFor={props.id}>
      {props.label}
      <span className="password-input-wrap">
        <input
          id={props.id}
          type={props.visible ? "text" : "password"}
          autoComplete={props.autoComplete}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          required
        />
        <button type="button" className="password-visibility-button" onClick={props.onToggle}
          aria-label={`${props.visible ? "Hide" : "Show"} ${props.label.toLowerCase()}`}
          aria-pressed={props.visible}>
          {props.visible ? "Hide" : "Show"}
        </button>
      </span>
    </label>
  );
}

export function AccountPage({ settings, onUnauthorized }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const toggle = (field: string) =>
    setVisible((current) => ({ ...current, [field]: !current[field] }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!currentPassword || !newPassword || !confirmation) {
      setError("All password fields are required.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must contain at least 8 characters.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must differ from the current password.");
      return;
    }
    if (confirmation !== newPassword) {
      setError("Confirmation must match the new password.");
      return;
    }

    setSubmitting(true);
    try {
      await changePassword(settings, currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      setVisible({});
      setSuccess("Password changed successfully");
    } catch (caught) {
      const status = caught && typeof caught === "object" && "status" in caught
        ? (caught as { status?: number }).status : undefined;
      if (status === 401) {
        onUnauthorized();
        return;
      }
      if (status === 403) {
        setError("API-token credentials cannot change a user password.");
        return;
      }
      setError(caught instanceof Error ? caught.message : "Unable to change password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="panel account-page" aria-labelledby="account-heading">
      <div className="section-heading">
        <h2 id="account-heading">Account</h2>
        <p>Manage the security settings for your user account.</p>
      </div>
      <section className="account-card" aria-labelledby="change-password-heading">
        <h3 id="change-password-heading">Change Password</h3>
        <p>Choose a new password with at least 8 characters.</p>
        {error ? <div className="form-message error-message" role="alert">{error}</div> : null}
        {success ? <div className="form-message success-message" role="status">{success}</div> : null}
        <form className="grid-form password-form" onSubmit={submit}>
          <PasswordField id="current-password" label="Current password" value={currentPassword}
            autoComplete="current-password" visible={Boolean(visible.current)}
            onChange={setCurrentPassword} onToggle={() => toggle("current")} />
          <PasswordField id="new-password" label="New password" value={newPassword}
            autoComplete="new-password" visible={Boolean(visible.new)}
            onChange={setNewPassword} onToggle={() => toggle("new")} />
          <PasswordField id="confirm-new-password" label="Confirm new password" value={confirmation}
            autoComplete="new-password" visible={Boolean(visible.confirmation)}
            onChange={setConfirmation} onToggle={() => toggle("confirmation")} />
          <div className="password-form-actions full-width">
            <button type="submit" disabled={submitting}>
              {submitting ? "Changing password…" : "Change password"}
            </button>
          </div>
        </form>
      </section>
    </section>
  );
}
