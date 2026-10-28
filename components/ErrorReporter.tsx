"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client-errors";

/** Catches failures React does not route through an error boundary — event
 * handlers, timers and unhandled promise rejections. */
export function ErrorReporter() {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      // Cross-origin script failures arrive as "Script error." with no details;
      // there is nothing useful to log.
      if (!event.error) return;
      reportClientError(event.error, "window");
    }

    function onRejection(event: PromiseRejectionEvent) {
      reportClientError(event.reason, "rejection");
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
