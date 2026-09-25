"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { useT } from "@/lib/i18n/preferences";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-10">
      <Alert tone="bad" title={t("common.error")}>
        <p>{t("admin.errorPageFailed")}</p>
        <button type="button" onClick={() => reset()} className="btn btn-ghost mt-3 px-3 py-1.5 text-xs">
          <RefreshCw className="size-3.5" />
          {t("common.retry")}
        </button>
      </Alert>
    </div>
  );
}
