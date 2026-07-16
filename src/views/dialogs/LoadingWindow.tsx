import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, LinearProgress } from "@mui/material";
import { useUiStore } from "@/resources/store/uiStore";

// Port of `dialogs/dialog-loading-window/dialog-loading-window.{ts,html}`. Plan §7:
// "-> MUI Dialog + LinearProgress driven by uiStore.loading". The old dialog faked a
// gradually-slowing progress bar to reassure the user while metamodels/models load.
// Here `open` is driven by uiStore.loading (set by SceneGroup.initTree); we keep the
// old gentle fake-progress curve (capped at 99%) so the bar still feels alive, then
// snap to 100% and unmount when loading flips false.
export default function LoadingWindow() {
  const loading = useUiStore((s) => s.loading);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!loading) {
      setProgress(1);
      return;
    }
    setProgress(0);
    let current = 0;
    let timer: ReturnType<typeof setTimeout>;

    // Mirrors the old updateProgressBar(): faster early, slower near the end.
    const step = () => {
      if (current >= 0.99) {
        current = 0.99;
        setProgress(0.99);
        return;
      }
      let delay: number;
      if (current < 0.5) {
        current += 0.1;
        delay = 500;
      } else if (current < 0.8) {
        current += 0.05;
        delay = 1000;
      } else {
        current += 0.02 * (1 - current);
        delay = 1500;
      }
      setProgress(current);
      timer = setTimeout(step, delay);
    };
    timer = setTimeout(step, 300);
    return () => clearTimeout(timer);
  }, [loading]);

  return (
    <Dialog open={loading} maxWidth="sm" fullWidth>
      <DialogTitle>Please wait... your metamodels and models are being loaded.</DialogTitle>
      <DialogContent sx={{ py: 4 }}>
        <LinearProgress variant="determinate" value={Math.min(progress, 1) * 100} />
      </DialogContent>
    </Dialog>
  );
}
