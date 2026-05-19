import { useCallback, useState } from "react";
import { z } from "zod";
import { apiFetch } from "@/lib/api-client";
import { getDisplayErrorMessage } from "@/lib/display-error";
import { useToast } from "@/hooks/use-toast";
import { useDeferredDialogCleanup } from "@/hooks/use-deferred-dialog-cleanup";
import { useI18n } from "@/i18n/I18nProvider";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const emailResponseSchema = z.object({ ok: z.boolean(), email: z.string().email().optional() });

export interface EmailChangeController {
  emailDialogOpen: boolean;
  setEmailDialogOpen: (open: boolean) => void;
  handleEmailDialogOpenChange: (open: boolean) => void;
  emailCurrentPassword: string;
  setEmailCurrentPassword: (value: string) => void;
  newEmail: string;
  setNewEmail: (value: string) => void;
  isUpdatingEmail: boolean;
  updateEmail: () => Promise<void>;
}

export function useEmailChange(): EmailChangeController {
  const { toast } = useToast();
  const { t } = useI18n();
  const [emailDialogOpen, setEmailDialogOpenState] = useState(false);
  const [emailCurrentPassword, setEmailCurrentPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);

  const resetForm = useCallback(() => {
    setEmailCurrentPassword("");
    setNewEmail("");
  }, []);
  const { scheduleCleanup, cancelCleanup } = useDeferredDialogCleanup(resetForm);

  const setEmailDialogOpen = useCallback(
    (open: boolean) => {
      setEmailDialogOpenState(open);
      if (open) {
        cancelCleanup();
        return;
      }
      scheduleCleanup();
    },
    [cancelCleanup, scheduleCleanup],
  );
  const handleEmailDialogOpenChange = setEmailDialogOpen;

  const updateEmail = useCallback(async () => {
    if (!emailCurrentPassword.trim()) {
      toast({ title: t("settings.email.currentPasswordRequired"), variant: "destructive" });
      return;
    }
    if (!newEmail.trim() || !emailPattern.test(newEmail.trim())) {
      toast({ title: t("settings.email.invalidEmail"), variant: "destructive" });
      return;
    }

    setIsUpdatingEmail(true);
    try {
      await apiFetch("/api/account/email", emailResponseSchema, {
        method: "PATCH",
        body: JSON.stringify({
          currentPassword: emailCurrentPassword,
          newEmail: newEmail.trim().toLowerCase(),
        }),
      });
      toast({
        title: t("settings.email.updated"),
        description: t("settings.email.updatedDescription"),
      });
      setEmailDialogOpenState(false);
      scheduleCleanup();
    } catch (e: unknown) {
      toast({
        title: t("settings.email.updateFailed"),
        description: getDisplayErrorMessage(e, t("settings.email.updateFailedDescription")),
        variant: "destructive",
      });
    } finally {
      setIsUpdatingEmail(false);
    }
  }, [emailCurrentPassword, newEmail, scheduleCleanup, t, toast]);

  return {
    emailDialogOpen,
    setEmailDialogOpen,
    handleEmailDialogOpenChange,
    emailCurrentPassword,
    setEmailCurrentPassword,
    newEmail,
    setNewEmail,
    isUpdatingEmail,
    updateEmail,
  };
}
