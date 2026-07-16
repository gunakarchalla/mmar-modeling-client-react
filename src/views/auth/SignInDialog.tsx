import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Stack,
  Typography,
} from "@mui/material";
import { useAuthStore } from "@/resources/store/authStore";
import { useLogStore } from "@/resources/store/logStore";
import { DEV_USERNAME, DEV_PASSWORD } from "@/config";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Replaces dialogs/user-management (user-management.ts|html). Logs in against the
 * authStore; on success the store publishes the `login` event (which the
 * scenegroup subscribes to in P7) and this dialog closes. The old "1s delay then
 * open if no valid token" lifecycle now lives in App.tsx: it renders this dialog
 * whenever there is no authenticated user.
 *
 * Dev autofill: the old client prefilled from process.env.USERNAME/PASSWORD; here
 * the fields seed from VITE_USERNAME/VITE_PASSWORD when set (unset in production).
 */
export default function SignInDialog({ open, onClose }: Props) {
  const [username, setUsername] = useState(DEV_USERNAME ?? "");
  const [password, setPassword] = useState(DEV_PASSWORD ?? "");
  const [errorMessage, setErrorMessage] = useState("");

  const login = useAuthStore((s) => s.login);
  const log = useLogStore((s) => s.log);

  async function handleSignIn() {
    if (!username || !password) {
      setErrorMessage("Please enter username and password");
      return;
    }
    setErrorMessage("");
    const success = await login(username, password);
    if (success) {
      onClose();
    } else {
      setErrorMessage("Invalid username or password");
      log("Invalid username or password", "error");
    }
  }

  return (
    // The old dialog is non-dismissable until logged in; disable backdrop/escape close.
    <Dialog open={open} maxWidth="xs" fullWidth disableEscapeKeyDown>
      <DialogTitle>User Management</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            fullWidth
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSignIn();
            }}
            autoComplete="current-password"
            fullWidth
          />
          {errorMessage && (
            <Typography color="error" variant="body2">
              {errorMessage}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={() => void handleSignIn()}>
          Login
        </Button>
      </DialogActions>
    </Dialog>
  );
}
