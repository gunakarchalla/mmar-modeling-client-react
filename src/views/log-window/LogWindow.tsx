import { useEffect, useRef, useState } from "react";
import {
  Box,
  Typography,
  IconButton,
  Icon,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from "@mui/material";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import { useThrottledLogArray } from "@/resources/store/logStore";

// Renders the shared log entries (log-window.html's repeat.for over logger.logArray).
// logArray is newest-first (logStore unshifts), so the newest entry is at the top.
// The old template printed the *current* time per row rather than a per-entry
// timestamp (LogEntry carries no time) — we keep that behaviour.
function LogEntries() {
  const logArray = useThrottledLogArray();
  const time = new Date().toLocaleTimeString();
  return (
    <>
      {logArray.map((entry, i) => (
        <Tooltip key={i} title={entry.value} placement="left">
          <Box
            sx={{
              alignContent: "center",
              fontSize: "8pt",
              borderTop: "solid 1pt rgb(128,128,128)",
              px: 0.5,
              py: 0.25,
            }}
          >
            {time}:
            <br />
            <Icon sx={{ fontSize: "12pt", verticalAlign: "middle", mr: 0.5 }}>
              {entry.status}
            </Icon>
            <span>{entry.value}</span>
          </Box>
        </Tooltip>
      ))}
    </>
  );
}

// Port of `views/log-window/log-window.{ts,html}`: a scrollable "Log" panel with
// an expand-to-dialog button. Newest entries live at the top, so we keep the scroll
// pinned to the top when entries arrive (the old client scrolled to bottom because
// its list was oldest-first). Copies the metamodeling twin's LogWindow.
export default function LogWindow() {
  const [open, setOpen] = useState(false);
  const logArray = useThrottledLogArray();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [logArray.length]);

  return (
    <Box sx={{ height: "100%", overflowY: "auto", p: 1 }} ref={scrollRef}>
      <Typography
        variant="subtitle2"
        sx={{
          m: 0,
          p: 0,
          position: "sticky",
          top: 0,
          backgroundColor: "#f5f5f5e5",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
        }}
      >
        Log
        <IconButton size="small" onClick={() => setOpen(true)}>
          <OpenInFullIcon fontSize="small" />
        </IconButton>
      </Typography>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Log Window</DialogTitle>
        <DialogContent>
          <LogEntries />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} autoFocus>
            Ok
          </Button>
        </DialogActions>
      </Dialog>

      <LogEntries />
    </Box>
  );
}
