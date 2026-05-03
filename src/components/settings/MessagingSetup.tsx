import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Phone, CheckCircle, MessageCircle, Loader2, Send } from "lucide-react";
import { useOrganizationAccess } from "@/hooks/useOrganizationAccess";

interface Registration {
  id: string;
  channel: string;
  channel_user_id: string;
  verified_at: string | null;
}

const CHANNEL_ID_HASH_SALT = import.meta.env.VITE_CHANNEL_ID_HASH_SALT || "koffey-whatsapp-salt";

export function MessagingSetup() {
  const { organizationId } = useOrganizationAccess();
  const [whatsAppRegistration, setWhatsAppRegistration] = useState<Registration | null>(null);
  const [telegramRegistration, setTelegramRegistration] = useState<Registration | null>(null);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "verify">("phone");
  const [sending, setSending] = useState(false);
  const [telegramCode, setTelegramCode] = useState<string>("");
  const [telegramBotUsername, setTelegramBotUsername] = useState<string>("");
  const [creatingTelegramCode, setCreatingTelegramCode] = useState(false);

  useEffect(() => {
    loadRegistration();
  }, []);

  const loadRegistration = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data, error } = await supabase
        .from("user_channel_registrations")
        .select("id, channel, channel_user_id, verified_at")
        .eq("user_id", user.id)
        .in("channel", ["whatsapp", "telegram"]);
      if (error) throw error;

      const rows = data || [];
      const pickPreferred = (channel: "whatsapp" | "telegram") =>
        rows
          .filter((row) => row.channel === channel)
          .sort((a, b) => Number(!!b.verified_at) - Number(!!a.verified_at))[0] || null;
      const whatsapp = pickPreferred("whatsapp");
      const telegram = pickPreferred("telegram");

      setWhatsAppRegistration(whatsapp as Registration | null);
      setTelegramRegistration(telegram as Registration | null);
      if (whatsapp?.channel_user_id && !whatsapp.verified_at) {
        setPhone(String(whatsapp.channel_user_id));
      }
    } catch {
      // No registration found
    } finally {
      setLoading(false);
    }
  };

  const normalizePhone = (phone: string): string => {
    const hasPlus = phone.startsWith("+");
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 10) return `+1${digits}`;
    return hasPlus ? `+${digits}` : `+${digits}`;
  };

  const hashPhone = async (phone: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(`whatsapp:${phone}:${CHANNEL_ID_HASH_SALT}`);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  };

  const handleSendCode = async () => {
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      
      const normalized = normalizePhone(phone);
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      const hash = await hashPhone(normalized);

      const registrationPayload = {
        user_id: user.id,
        channel: "whatsapp",
        channel_user_id: normalized,
        channel_user_id_hash: hash,
        verification_code: verificationCode,
        verification_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        verified_at: null,
        is_primary: true,
        last_inbound_at: null,
        channel_metadata: {
          organization_id: organizationId,
        },
      };

      // Keep one canonical WhatsApp registration row per user to avoid duplicate-link failures.
      const { data: existingRows, error: existingError } = await supabase
        .from("user_channel_registrations")
        .select("id")
        .eq("user_id", user.id)
        .eq("channel", "whatsapp")
        .order("updated_at", { ascending: false })
        .limit(1);

      if (existingError) throw existingError;

      const existingId = existingRows?.[0]?.id;
      if (existingId) {
        const { error: updateError } = await supabase
          .from("user_channel_registrations")
          .update(registrationPayload)
          .eq("id", existingId);
        if (updateError) throw updateError;

        await supabase
          .from("user_channel_registrations")
          .delete()
          .eq("user_id", user.id)
          .eq("channel", "whatsapp")
          .neq("id", existingId);
      } else {
        const { error: insertError } = await supabase
          .from("user_channel_registrations")
          .insert(registrationPayload);
        if (insertError) throw insertError;
      }

      // Send code via WhatsApp
      const { data: sendData, error: sendError } = await supabase.functions.invoke("whatsapp-adapter", {
        body: { action: "send-verification", phone: normalized, code: verificationCode },
      });

      if (sendError) throw sendError;
      if (!sendData?.success) {
        throw new Error(sendData?.error || "Failed to send WhatsApp verification code");
      }

      setStep("verify");
      toast.success("Verification code sent to your WhatsApp!");
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "Failed to send code");
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async () => {
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      
      const normalized = normalizePhone(phone);

      const { data, error } = await supabase
        .from("user_channel_registrations")
        .select("id")
        .eq("user_id", user.id)
        .eq("channel", "whatsapp")
        .eq("verification_code", code)
        .gt("verification_expires_at", new Date().toISOString())
        .order("verification_expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) throw new Error("Invalid or expired code");

      await supabase
        .from("user_channel_registrations")
        .update({
          verified_at: new Date().toISOString(),
          verification_code: null,
          channel_metadata: {
            organization_id: organizationId,
          },
        })
        .eq("id", data.id);

      toast.success("WhatsApp connected!");
      loadRegistration();

      // Send welcome message
      const { data: welcomeData, error: welcomeError } = await supabase.functions.invoke("whatsapp-adapter", {
        body: {
          action: "send",
          channelUserId: normalized,
          content: "🎉 You're all set! Your WhatsApp is now connected to Koffey.\n\n" +
            "Try texting me:\n" +
            "• \"What's my pipeline?\"\n" +
            "• \"Deals closing this month\"\n" +
            "• \"Add note to [company]: [your note]\"\n\n" +
            "I'm here to help!",
          checkWindow: false,
        },
      });
      if (welcomeError) {
        console.warn("Failed to send WhatsApp welcome message:", welcomeError);
      } else if (!welcomeData?.success) {
        console.warn("WhatsApp welcome message failed:", welcomeData?.error);
      }
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "Verification failed");
    } finally {
      setSending(false);
    }
  };

  const handleDisconnect = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    await supabase
      .from("user_channel_registrations")
      .delete()
      .eq("user_id", user.id)
      .eq("channel", "whatsapp");
    
    setWhatsAppRegistration(null);
    setStep("phone");
    setPhone("");
    setCode("");
    toast.success("WhatsApp disconnected");
  };

  const handleGenerateTelegramCode = async () => {
    setCreatingTelegramCode(true);
    try {
      const { data, error } = await supabase.functions.invoke("telegram-adapter", {
        body: {
          action: "create-link-code",
          organizationId,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to create Telegram code");

      setTelegramCode(String(data.code || ""));
      setTelegramBotUsername(String(data.botUsername || "").replace(/^@/, ""));
      toast.success("Telegram link code created");
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "Failed to create Telegram link code");
    } finally {
      setCreatingTelegramCode(false);
    }
  };

  const handleDisconnectTelegram = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("user_channel_registrations")
      .delete()
      .eq("user_id", user.id)
      .eq("channel", "telegram");

    setTelegramRegistration(null);
    setTelegramCode("");
    setTelegramBotUsername("");
    toast.success("Telegram disconnected");
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          Messaging
        </CardTitle>
        <CardDescription>
          Connect WhatsApp or Telegram to interact with your CRM on the go.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Phone className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="font-medium">WhatsApp</div>
              <div className="text-sm text-muted-foreground">
                Text your CRM from anywhere
              </div>
            </div>
          </div>
          {whatsAppRegistration?.verified_at ? (
            <Badge variant="default">
              <CheckCircle className="h-3 w-3 mr-1" /> Connected
            </Badge>
          ) : (
            <Badge variant="secondary">Not connected</Badge>
          )}
        </div>

        {whatsAppRegistration?.verified_at ? (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Connected: {whatsAppRegistration.channel_user_id}
            </div>
            <Button variant="outline" onClick={handleDisconnect}>
              Disconnect
            </Button>
          </div>
        ) : step === "phone" ? (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Enter your phone number to receive a verification code via WhatsApp.
            </div>
            <Input
              placeholder="+1 (555) 123-4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Button onClick={handleSendCode} disabled={sending || !phone.trim()}>
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Verification Code"
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Enter the 6-digit code sent to your WhatsApp:
            </div>
            <Input
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
            />
            <div className="flex gap-2">
              <Button onClick={handleVerify} disabled={sending || code.length !== 6}>
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify"
                )}
              </Button>
              <Button variant="ghost" onClick={() => setStep("phone")}>
                Change Number
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Send className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="font-medium">Telegram</div>
              <div className="text-sm text-muted-foreground">
                Chat with your CRM via Telegram bot
              </div>
            </div>
          </div>
          {telegramRegistration?.verified_at ? (
            <Badge variant="default">
              <CheckCircle className="h-3 w-3 mr-1" /> Connected
            </Badge>
          ) : (
            <Badge variant="secondary">Not connected</Badge>
          )}
        </div>

        {telegramRegistration?.verified_at ? (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Connected chat ID: {telegramRegistration.channel_user_id}
            </div>
            <Button variant="outline" onClick={handleDisconnectTelegram}>
              Disconnect Telegram
            </Button>
          </div>
        ) : (
          <div className="space-y-3 border rounded-lg p-4">
            <div className="text-sm text-muted-foreground">
              Generate a link code, then send <span className="font-mono">/verify CODE</span> in your Telegram bot chat.
            </div>
            {telegramCode ? (
              <div className="text-sm">
                <div className="font-medium">Your code: <span className="font-mono">{telegramCode}</span></div>
                <div className="text-muted-foreground">
                  {telegramBotUsername
                    ? <>Open <span className="font-mono">@{telegramBotUsername}</span> and send <span className="font-mono">/verify {telegramCode}</span>.</>
                    : <>Open your Telegram bot and send <span className="font-mono">/verify {telegramCode}</span>.</>}
                </div>
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button onClick={handleGenerateTelegramCode} disabled={creatingTelegramCode}>
                {creatingTelegramCode ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Generate Telegram Code"
                )}
              </Button>
              <Button variant="ghost" onClick={loadRegistration}>
                Refresh Status
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
