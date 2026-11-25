import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { installBackGuard } from "./hooks/use-back-to-close";

// Նախքան Router-ը. «հետ»-ը նախ փակում է լրիվ էկրանի պատուհանը (use-back-to-close.ts)։
installBackGuard();

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
});
