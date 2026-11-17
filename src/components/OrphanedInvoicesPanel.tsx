import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Unlink, Loader2, Check, ChevronsUpDown } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface OrphanedInvoice {
  id: string;
  stripe_invoice_id: string | null;
  stripe_customer_id: string | null;
  invoice_number: string | null;
  amount_due: number;
  amount_paid: number;
  currency: string | null;
  status: string;
  email: string | null;
  needs_review: boolean;
  review_reason: string | null;
  created_at: string;
}

interface ProfileOption {
  id: string;
  full_name: string;
  email: string | null;
}

const OrphanedInvoicesPanel = () => {
  const { isAdmin, loading: authLoading, adminChecked } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<OrphanedInvoice[]>([]);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [profileId, setProfileId] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchAll = async () => {
    const [orphanRes, profRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from("v_orphaned_invoices").select("*").order("created_at", { ascending: false }),
      supabase.from("client_profiles").select("id, full_name, email").order("full_name"),
    ]);
    setRows((orphanRes.data as OrphanedInvoice[]) || []);
    setProfiles((profRes.data as ProfileOption[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (authLoading || !adminChecked || !isAdmin) return;
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, adminChecked, isAdmin]);

  const selectedProfile = useMemo(() => profiles.find((p) => p.id === profileId), [profiles, profileId]);
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  // Wait for both auth signals before trusting isAdmin (async admin check).
  if (authLoading || !adminChecked || !isAdmin) return null;

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set());
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const assign = async () => {
    if (selected.size === 0 || !selectedProfile) return;
    setSubmitting(true);
    // All mutation goes through the admin-only RPC — no direct table writes here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("admin_link_invoices_to_profile", {
      p_invoice_ids: Array.from(selected),
      p_profile_id: selectedProfile.id,
    });
    setSubmitting(false);
    setConfirmOpen(false);
    if (error) {
      toast({ title: "Couldn't link invoices", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Linked ${data} invoice(s) to ${selectedProfile.full_name}` });
    setSelected(new Set());
    setProfileId("");
    fetchAll();
  };

  const amountLabel = (inv: OrphanedInvoice) => {
    const amt = `$${Number(inv.amount_due).toFixed(2)}`;
    return inv.currency && inv.currency.toLowerCase() !== "usd" ? `${amt} ${inv.currency.toUpperCase()}` : amt;
  };

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-lg font-display tracking-wider flex items-center gap-2">
          <Unlink className="h-5 w-5 text-primary" /> Orphaned Invoices
          {rows.length > 0 && <Badge variant="secondary">{rows.length}</Badge>}
        </h2>

        {rows.length > 0 && (
          <div className="flex items-center gap-2">
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" role="combobox" aria-expanded={pickerOpen} className="w-64 justify-between font-normal">
                  <span className="truncate">
                    {selectedProfile ? `${selectedProfile.full_name}${selectedProfile.email ? ` (${selectedProfile.email})` : ""}` : "Select a client…"}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="end">
                <Command>
                  <CommandInput placeholder="Search by name or email…" />
                  <CommandList>
                    <CommandEmpty>No clients found.</CommandEmpty>
                    <CommandGroup>
                      {profiles.map((p) => (
                        <CommandItem
                          key={p.id}
                          value={`${p.full_name} ${p.email || ""}`}
                          onSelect={() => { setProfileId(p.id === profileId ? "" : p.id); setPickerOpen(false); }}
                        >
                          <Check className={cn("h-4 w-4 mr-2", profileId === p.id ? "opacity-100" : "opacity-0")} />
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm truncate">{p.full_name}</span>
                            {p.email && <span className="block text-xs text-muted-foreground truncate">{p.email}</span>}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Button size="sm" disabled={selected.size === 0 || !selectedProfile} onClick={() => setConfirmOpen(true)}>
              Assign to client
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <Card><CardContent className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></CardContent></Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            No orphaned invoices — everything is linked.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allSelected} onCheckedChange={(c) => toggleAll(c === true)} aria-label="Select all" />
                  </TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Stripe customer</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Review reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((inv) => (
                  <TableRow
                    key={inv.id}
                    data-state={selected.has(inv.id) ? "selected" : undefined}
                    className="cursor-pointer"
                    onClick={() => toggleOne(inv.id, !selected.has(inv.id))}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(inv.id)}
                        onCheckedChange={(c) => toggleOne(inv.id, c === true)}
                        aria-label={`Select invoice ${inv.invoice_number || inv.id}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium text-sm">{inv.invoice_number || "—"}</TableCell>
                    <TableCell className="text-sm">{inv.email || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">{inv.stripe_customer_id || "—"}</TableCell>
                    <TableCell className="text-right font-display">{amountLabel(inv)}</TableCell>
                    <TableCell>
                      <Badge variant={inv.status === "paid" ? "default" : "secondary"} className="capitalize text-xs">{inv.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{format(new Date(inv.created_at), "MMM d, yyyy")}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[220px]">
                      {inv.needs_review && inv.review_reason ? inv.review_reason : inv.needs_review ? "Needs review" : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Link {selected.size} invoice{selected.size === 1 ? "" : "s"} to {selectedProfile?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The selected invoice{selected.size === 1 ? "" : "s"} will be assigned to{" "}
              {selectedProfile?.full_name}{selectedProfile?.email ? ` (${selectedProfile.email})` : ""} and their Stripe
              customer will be merged into that profile. They'll show up in the client's portal payments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); assign(); }} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Link invoice{selected.size === 1 ? "" : "s"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default OrphanedInvoicesPanel;
