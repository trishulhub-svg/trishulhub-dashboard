"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  IdCard,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Lock,
  Unlock,
  Eye,
  Save,
  RefreshCw,
  AlertCircle,
  Shield,
  Building2,
  User,
  Landmark,
  FileText,
  Filter,
  Search,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { cn, safeArray, safeText } from "@/lib/utils";

// ━━ Types ━━

interface UserDetailResponse {
  id: string;
  userId: string;
  country: string | null;
  countryLocked: boolean;
  fullNameAsPerId: string | null;
  govIdType: string | null;
  govIdNumberMasked: string;
  bankAccountName: string | null;
  bankAccountNumberMasked: string;
  bankSortCode: string | null;
  bankName: string | null;
  bankBranch: string | null;
  status: string; // PENDING, APPROVED, REJECTED, NOT_SUBMITTED
  rejectedReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
    department: string | null;
  };
}

type Country = "UK" | "INDIA" | "";
type GovIdType = "AADHAAR" | "PAN" | "NI" | "";

// ━━ Helpers ━━

const statusBadgeClasses: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  APPROVED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  NOT_SUBMITTED: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

const statusIcons: Record<string, typeof Clock> = {
  PENDING: Clock,
  APPROVED: CheckCircle2,
  REJECTED: XCircle,
  NOT_SUBMITTED: AlertCircle,
};

const roleColors: Record<string, string> = {
  SUPER_ADMIN: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  ADMIN: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  PROJECT_MANAGER: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  DEVELOPER: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  VIEWER: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
};

function StatusBadge({ status }: { status: string }) {
  const Icon = statusIcons[status] || AlertCircle;
  const label = status === "NOT_SUBMITTED" ? "Not Submitted" : status.charAt(0) + status.slice(1).toLowerCase();
  return (
    <Badge className={cn("gap-1 font-medium", statusBadgeClasses[status] || statusBadgeClasses.NOT_SUBMITTED)}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

function countryLabel(country: string | null): string {
  if (country === "UK") return "United Kingdom 🇬🇧";
  if (country === "INDIA") return "India 🇮🇳";
  return "Not selected";
}

function govIdTypeLabel(type: string | null): string {
  switch (type) {
    case "AADHAAR": return "Aadhaar";
    case "PAN": return "PAN";
    case "NI": return "National Insurance (NI)";
    default: return "—";
  }
}

function sortCodeLabel(country: string | null): string {
  return country === "INDIA" ? "IFSC Code" : "Sort Code";
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "—";
  }
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "?";
}

// ━━ Main Page ━━

export default function MyDetailsPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();

  const userRole = session?.user?.role || "DEVELOPER";
  const isUserAdmin = userRole === "SUPER_ADMIN" || userRole === "ADMIN";
  const currentUserId = session?.user?.id;

  const [myDetail, setMyDetail] = useState<UserDetailResponse | null>(null);
  const [allDetails, setAllDetails] = useState<UserDetailResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formCountry, setFormCountry] = useState<Country>("");
  const [formFullName, setFormFullName] = useState("");
  const [formGovIdType, setFormGovIdType] = useState<GovIdType>("");
  const [formGovIdNumber, setFormGovIdNumber] = useState("");
  const [formBankAccountName, setFormBankAccountName] = useState("");
  const [formBankAccountNumber, setFormBankAccountNumber] = useState("");
  const [formBankSortCode, setFormBankSortCode] = useState("");
  const [formBankName, setFormBankName] = useState("");
  const [formBankBranch, setFormBankBranch] = useState("");

  // Whether the user is editing existing (rejected) details
  const [isEditing, setIsEditing] = useState(false);

  // Admin review dialog
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<UserDetailResponse | null>(null);
  const [reviewStatus, setReviewStatus] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [rejectReason, setRejectReason] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // Admin view detail dialog
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewTarget, setViewTarget] = useState<UserDetailResponse | null>(null);

  // Admin unlock country dialog
  const [unlockTarget, setUnlockTarget] = useState<UserDetailResponse | null>(null);
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);

  // Admin filters
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterCountry, setFilterCountry] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // ── Data fetch ──
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/user-details", { credentials: "include" });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load details");
      }
      const data = await res.json();
      if (isUserAdmin) {
        setAllDetails(Array.isArray(data) ? data : []);
        // Find my own detail from the list
        const mine = (data as UserDetailResponse[]).find((d) => d.userId === currentUserId) || null;
        setMyDetail(mine && mine.status !== "NOT_SUBMITTED" ? mine : null);
      } else {
        setMyDetail(data || null);
      }
    } catch (err) {
      console.error("[my-details] fetchData error:", err);
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [router, isUserAdmin, currentUserId]);

  useEffect(() => {
    if (sessionStatus === "loading") return;
    fetchData();
  }, [sessionStatus, fetchData]);

  // ── Pre-fill form when editing rejected details ──
  useEffect(() => {
    if (myDetail && myDetail.status === "REJECTED" && !isEditing) {
      // Pre-fill the country (locked) but leave sensitive fields empty (we don't have the raw values)
      setFormCountry((myDetail.country as Country) || "");
      setFormFullName(myDetail.fullNameAsPerId || "");
      setFormGovIdType((myDetail.govIdType as GovIdType) || "");
      setFormBankAccountName(myDetail.bankAccountName || "");
      setFormBankName(myDetail.bankName || "");
      setFormBankBranch(myDetail.bankBranch || "");
      setFormBankSortCode(myDetail.bankSortCode || "");
      // gov ID and bank account number stay blank — user must re-enter
      setFormGovIdNumber("");
      setFormBankAccountNumber("");
    }
  }, [myDetail, isEditing]);

  // ── Country change handler — when user picks country, auto-select gov ID type ──
  const handleCountryChange = (value: Country) => {
    setFormCountry(value);
    // Auto-set gov ID type based on country
    if (value === "UK") setFormGovIdType("NI");
    else if (value === "INDIA") setFormGovIdType("AADHAAR");
    else setFormGovIdType("");
    // Clear sort code field (different format per country)
    setFormBankSortCode("");
    // Clear branch (only required for India)
    if (value === "UK") setFormBankBranch("");
  };

  // ── Submit form ──
  const handleSubmit = async () => {
    // Validate
    if (!formCountry) {
      toast.error("Please select your country");
      return;
    }
    if (!formFullName || formFullName.trim().length < 2) {
      toast.error("Please enter your full name as per your government document");
      return;
    }
    if (!formGovIdType) {
      toast.error("Please select your government ID type");
      return;
    }
    if (!formGovIdNumber) {
      toast.error("Please enter your government ID number");
      return;
    }
    if (!formBankAccountName || formBankAccountName.trim().length < 2) {
      toast.error("Please enter the bank account holder name");
      return;
    }
    if (!formBankAccountNumber) {
      toast.error("Please enter your bank account number");
      return;
    }
    if (!formBankSortCode) {
      toast.error(formCountry === "UK" ? "Please enter the bank sort code" : "Please enter the IFSC code");
      return;
    }
    if (!formBankName) {
      toast.error("Please enter the bank name");
      return;
    }
    if (formCountry === "INDIA" && !formBankBranch) {
      toast.error("Please enter the bank branch name");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/user-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          country: formCountry,
          fullNameAsPerId: formFullName,
          govIdType: formGovIdType,
          govIdNumber: formGovIdNumber,
          bankAccountName: formBankAccountName,
          bankAccountNumber: formBankAccountNumber,
          bankSortCode: formBankSortCode,
          bankName: formBankName,
          bankBranch: formBankBranch,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Details submitted for review");
        setIsEditing(false);
        // Reset sensitive fields
        setFormGovIdNumber("");
        setFormBankAccountNumber("");
        fetchData();
      } else {
        toast.error(data.error || "Failed to submit details");
      }
    } catch (err) {
      console.error("[my-details] handleSubmit error:", err);
      toast.error("Failed to submit details");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Admin: review (approve/reject) ──
  const handleReviewSubmit = async () => {
    if (!reviewTarget) return;
    if (reviewStatus === "REJECTED" && !rejectReason.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }
    setReviewSubmitting(true);
    try {
      const res = await fetch(`/api/user-details/${reviewTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "REVIEW",
          status: reviewStatus,
          rejectedReason: reviewStatus === "REJECTED" ? rejectReason.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Details ${reviewStatus === "APPROVED" ? "approved" : "rejected"}`);
        setReviewDialogOpen(false);
        setReviewTarget(null);
        setRejectReason("");
        setReviewStatus("APPROVED");
        fetchData();
      } else {
        toast.error(data.error || "Failed to update status");
      }
    } catch (err) {
      console.error("[my-details] handleReviewSubmit error:", err);
      toast.error("Failed to update status");
    } finally {
      setReviewSubmitting(false);
    }
  };

  // ── Admin: unlock country ──
  const handleUnlockCountry = async () => {
    if (!unlockTarget) return;
    try {
      const res = await fetch(`/api/user-details/${unlockTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "UNLOCK_COUNTRY" }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Country selection unlocked");
        setUnlockDialogOpen(false);
        setUnlockTarget(null);
        fetchData();
      } else {
        toast.error(data.error || "Failed to unlock country");
      }
    } catch (err) {
      console.error("[my-details] handleUnlockCountry error:", err);
      toast.error("Failed to unlock country");
    }
  };

  // ── Filtered admin list ──
  const filteredDetails = useMemo(() => {
    return allDetails.filter((d) => {
      if (filterStatus !== "ALL" && d.status !== filterStatus) return false;
      if (filterCountry !== "ALL" && d.country !== filterCountry) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const name = (d.user?.name || "").toLowerCase();
        const email = (d.user?.email || "").toLowerCase();
        if (!name.includes(q) && !email.includes(q)) return false;
      }
      return true;
    });
  }, [allDetails, filterStatus, filterCountry, searchQuery]);

  // ── Stats for admin ──
  const stats = useMemo(() => {
    const total = allDetails.length;
    const pending = allDetails.filter((d) => d.status === "PENDING").length;
    const approved = allDetails.filter((d) => d.status === "APPROVED").length;
    const rejected = allDetails.filter((d) => d.status === "REJECTED").length;
    const notSubmitted = allDetails.filter((d) => d.status === "NOT_SUBMITTED").length;
    return { total, pending, approved, rejected, notSubmitted };
  }, [allDetails]);

  // ── Loading ──
  if (sessionStatus === "loading" || loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">My Details</h1>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => { setError(null); fetchData(); }}>
          Try Again
        </Button>
      </div>
    );
  }

  // ── Determine the user's own detail state ──
  const hasSubmitted = !!myDetail && myDetail.status !== "NOT_SUBMITTED";
  const isApproved = myDetail?.status === "APPROVED";
  const isRejected = myDetail?.status === "REJECTED";
  const isPending = myDetail?.status === "PENDING";
  const showForm = !hasSubmitted || (isRejected && isEditing);

  // ━━ Render ━━

  return (
    <div className="space-y-6">
      <PageHeader
        title={isUserAdmin ? "My Details & Team Management" : "My Details"}
        description="Manage your personal, government ID, and bank account information"
      >
        <Button variant="outline" size="sm" onClick={fetchData} disabled={submitting}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </PageHeader>

      {isUserAdmin ? (
        <Tabs defaultValue="mine" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="mine">My Details</TabsTrigger>
            <TabsTrigger value="team">
              Team Management
              {stats.pending > 0 && (
                <span className="ml-2 h-4 min-w-[16px] px-1 flex items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                  {stats.pending}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ━━ Admin's own details tab ━━ */}
          <TabsContent value="mine" className="space-y-6 mt-4">
            <MyDetailSection
              hasSubmitted={hasSubmitted}
              isApproved={!!isApproved}
              isRejected={!!isRejected}
              isPending={!!isPending}
              myDetail={myDetail}
              showForm={showForm}
              isEditing={isEditing}
              setIsEditing={setIsEditing}
              formCountry={formCountry}
              formFullName={formFullName}
              formGovIdType={formGovIdType}
              formGovIdNumber={formGovIdNumber}
              formBankAccountName={formBankAccountName}
              formBankAccountNumber={formBankAccountNumber}
              formBankSortCode={formBankSortCode}
              formBankName={formBankName}
              formBankBranch={formBankBranch}
              handleCountryChange={handleCountryChange}
              setFormFullName={setFormFullName}
              setFormGovIdType={setFormGovIdType}
              setFormGovIdNumber={setFormGovIdNumber}
              setFormBankAccountName={setFormBankAccountName}
              setFormBankAccountNumber={setFormBankAccountNumber}
              setFormBankSortCode={setFormBankSortCode}
              setFormBankName={setFormBankName}
              setFormBankBranch={setFormBankBranch}
              handleSubmit={handleSubmit}
              submitting={submitting}
            />
          </TabsContent>

          {/* ━━ Team management tab ━━ */}
          <TabsContent value="team" className="space-y-4 mt-4">
            {/* Stats */}
            <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.total}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Pending</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-yellow-500" />
                    <span className="text-2xl font-bold">{stats.pending}</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Approved</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <span className="text-2xl font-bold">{stats.approved}</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Rejected</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-red-500" />
                    <span className="text-2xl font-bold">{stats.rejected}</span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Not Submitted</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-gray-500" />
                    <span className="text-2xl font-bold">{stats.notSubmitted}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Filter className="h-4 w-4" /> Filters
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <Label className="text-xs">Status</Label>
                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="All statuses" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All statuses</SelectItem>
                        <SelectItem value="PENDING">Pending</SelectItem>
                        <SelectItem value="APPROVED">Approved</SelectItem>
                        <SelectItem value="REJECTED">Rejected</SelectItem>
                        <SelectItem value="NOT_SUBMITTED">Not submitted</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Country</Label>
                    <Select value={filterCountry} onValueChange={setFilterCountry}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="All countries" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All countries</SelectItem>
                        <SelectItem value="UK">🇬🇧 United Kingdom</SelectItem>
                        <SelectItem value="INDIA">🇮🇳 India</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Search</Label>
                    <div className="relative mt-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Name or email..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Team details table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <IdCard className="h-4 w-4" /> Team Details
                </CardTitle>
                <CardDescription>
                  Review and manage personal details submitted by team members
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {/* Desktop: table */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Team Member</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Country</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDetails.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            No team members match your filters.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredDetails.map((d) => (
                          <TableRow key={d.userId}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-9 w-9">
                                  <AvatarFallback className="text-xs">{initials(d.user?.name || "?")}</AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <div className="font-medium truncate">{safeText(d.user?.name, "Unknown")}</div>
                                  <div className="text-xs text-muted-foreground truncate">{safeText(d.user?.email, "")}</div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={cn("font-medium", roleColors[d.user?.role || ""] || roleColors.DEVELOPER)}>
                                {safeText(d.user?.role, "")}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {d.country ? countryLabel(d.country) : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell><StatusBadge status={d.status} /></TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {d.createdAt ? formatDateTime(d.createdAt) : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {d.status !== "NOT_SUBMITTED" && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 p-0"
                                      onClick={() => { setViewTarget(d); setViewDialogOpen(true); }}
                                      title="View details"
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                    {d.status === "PENDING" && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-8 px-2 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                                          onClick={() => {
                                            setReviewTarget(d);
                                            setReviewStatus("APPROVED");
                                            setRejectReason("");
                                            setReviewDialogOpen(true);
                                          }}
                                          title="Approve"
                                        >
                                          <CheckCircle2 className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                                          onClick={() => {
                                            setReviewTarget(d);
                                            setReviewStatus("REJECTED");
                                            setRejectReason("");
                                            setReviewDialogOpen(true);
                                          }}
                                          title="Reject"
                                        >
                                          <XCircle className="h-4 w-4" />
                                        </Button>
                                      </>
                                    )}
                                    {d.countryLocked && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 w-8 p-0"
                                        onClick={() => { setUnlockTarget(d); setUnlockDialogOpen(true); }}
                                        title="Unlock country selection"
                                      >
                                        <Unlock className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile: cards */}
                <div className="md:hidden divide-y">
                  {filteredDetails.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      No team members match your filters.
                    </div>
                  ) : (
                    filteredDetails.map((d) => (
                      <div key={d.userId} className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar className="h-10 w-10 shrink-0">
                              <AvatarFallback className="text-xs">{initials(d.user?.name || "?")}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="font-medium truncate">{safeText(d.user?.name, "Unknown")}</div>
                              <div className="text-xs text-muted-foreground truncate">{safeText(d.user?.email, "")}</div>
                            </div>
                          </div>
                          <StatusBadge status={d.status} />
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge className={cn("font-medium", roleColors[d.user?.role || ""] || roleColors.DEVELOPER)}>
                            {safeText(d.user?.role, "")}
                          </Badge>
                          <span className="text-muted-foreground">{d.country ? countryLabel(d.country) : "No country"}</span>
                        </div>
                        {d.status !== "NOT_SUBMITTED" && (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8"
                              onClick={() => { setViewTarget(d); setViewDialogOpen(true); }}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" /> View
                            </Button>
                            {d.status === "PENDING" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-green-600 border-green-200 hover:bg-green-50 dark:hover:bg-green-900/20"
                                  onClick={() => {
                                    setReviewTarget(d);
                                    setReviewStatus("APPROVED");
                                    setRejectReason("");
                                    setReviewDialogOpen(true);
                                  }}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20"
                                  onClick={() => {
                                    setReviewTarget(d);
                                    setReviewStatus("REJECTED");
                                    setRejectReason("");
                                    setReviewDialogOpen(true);
                                  }}
                                >
                                  <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                                </Button>
                              </>
                            )}
                            {d.countryLocked && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8"
                                onClick={() => { setUnlockTarget(d); setUnlockDialogOpen(true); }}
                              >
                                <Unlock className="h-3.5 w-3.5 mr-1" /> Unlock
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        <MyDetailSection
          hasSubmitted={hasSubmitted}
          isApproved={!!isApproved}
          isRejected={!!isRejected}
          isPending={!!isPending}
          myDetail={myDetail}
          showForm={showForm}
          isEditing={isEditing}
          setIsEditing={setIsEditing}
          formCountry={formCountry}
          formFullName={formFullName}
          formGovIdType={formGovIdType}
          formGovIdNumber={formGovIdNumber}
          formBankAccountName={formBankAccountName}
          formBankAccountNumber={formBankAccountNumber}
          formBankSortCode={formBankSortCode}
          formBankName={formBankName}
          formBankBranch={formBankBranch}
          handleCountryChange={handleCountryChange}
          setFormFullName={setFormFullName}
          setFormGovIdType={setFormGovIdType}
          setFormGovIdNumber={setFormGovIdNumber}
          setFormBankAccountName={setFormBankAccountName}
          setFormBankAccountNumber={setFormBankAccountNumber}
          setFormBankSortCode={setFormBankSortCode}
          setFormBankName={setFormBankName}
          setFormBankBranch={setFormBankBranch}
          handleSubmit={handleSubmit}
          submitting={submitting}
        />
      )}

      {/* ━━ Review Dialog (admin) ━━ */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reviewStatus === "APPROVED" ? "Approve Details" : "Reject Details"}
            </DialogTitle>
            <DialogDescription>
              {reviewTarget && (
                <>Reviewing details for <strong>{reviewTarget.user?.name}</strong> ({reviewTarget.user?.email})</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Decision</Label>
              <RadioGroup
                value={reviewStatus}
                onValueChange={(v) => setReviewStatus(v as "APPROVED" | "REJECTED")}
                className="grid grid-cols-2 gap-2 mt-2"
              >
                <label className={cn(
                  "flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-colors",
                  reviewStatus === "APPROVED" ? "border-green-500 bg-green-50 dark:bg-green-900/20" : "border-input hover:bg-accent"
                )}>
                  <RadioGroupItem value="APPROVED" />
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium">Approve</span>
                </label>
                <label className={cn(
                  "flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-colors",
                  reviewStatus === "REJECTED" ? "border-red-500 bg-red-50 dark:bg-red-900/20" : "border-input hover:bg-accent"
                )}>
                  <RadioGroupItem value="REJECTED" />
                  <XCircle className="h-4 w-4 text-red-600" />
                  <span className="text-sm font-medium">Reject</span>
                </label>
              </RadioGroup>
            </div>
            {reviewStatus === "REJECTED" && (
              <div>
                <Label htmlFor="reject-reason" className="text-sm font-medium">
                  Reason for rejection <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="reject-reason"
                  placeholder="Explain why the details are being rejected..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="mt-1.5"
                  rows={4}
                  maxLength={1000}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This will be emailed to the user via SMTP.
                </p>
              </div>
            )}
            {reviewStatus === "APPROVED" && (
              <p className="text-sm text-muted-foreground">
                An approval notification will be emailed to the user.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleReviewSubmit}
              disabled={reviewSubmitting || (reviewStatus === "REJECTED" && !rejectReason.trim())}
              className={reviewStatus === "APPROVED" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
            >
              {reviewSubmitting ? "Submitting..." : reviewStatus === "APPROVED" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ━━ View Dialog (admin) ━━ */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Team Member Details</DialogTitle>
            <DialogDescription>
              {viewTarget && (
                <>Full details for <strong>{viewTarget.user?.name}</strong> ({viewTarget.user?.email})</>
              )}
            </DialogDescription>
          </DialogHeader>
          {viewTarget && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={viewTarget.status} />
                <Badge variant="outline">{countryLabel(viewTarget.country)}</Badge>
                {viewTarget.countryLocked && (
                  <Badge variant="outline" className="gap-1">
                    <Lock className="h-3 w-3" /> Country locked
                  </Badge>
                )}
              </div>

              {viewTarget.status === "REJECTED" && viewTarget.rejectedReason && (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-900 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-800 dark:text-red-300">Rejected</p>
                      <p className="text-sm text-red-700 dark:text-red-400 mt-1">{safeText(viewTarget.rejectedReason, "")}</p>
                      {viewTarget.reviewedAt && (
                        <p className="text-xs text-red-600 dark:text-red-500 mt-2">
                          Reviewed: {formatDateTime(viewTarget.reviewedAt)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <DetailField icon={User} label="Full Name (as per ID)" value={viewTarget.fullNameAsPerId} />
              <DetailField icon={FileText} label="Government ID Type" value={govIdTypeLabel(viewTarget.govIdType)} />
              <DetailField icon={IdCard} label="Government ID Number" value={viewTarget.govIdNumberMasked || "—"} mono />
              <DetailField icon={User} label="Bank Account Holder Name" value={viewTarget.bankAccountName} />
              <DetailField icon={Landmark} label="Bank Account Number" value={viewTarget.bankAccountNumberMasked || "—"} mono />
              <DetailField icon={Building2} label={sortCodeLabel(viewTarget.country)} value={viewTarget.bankSortCode} mono />
              <DetailField icon={Building2} label="Bank Name" value={viewTarget.bankName} />
              {viewTarget.country === "INDIA" && (
                <DetailField icon={Building2} label="Bank Branch" value={viewTarget.bankBranch} />
              )}

              {viewTarget.status === "APPROVED" && viewTarget.reviewedAt && (
                <p className="text-xs text-muted-foreground">
                  Approved on {formatDateTime(viewTarget.reviewedAt)}
                </p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            {viewTarget && viewTarget.countryLocked && (
              <Button
                variant="outline"
                onClick={() => {
                  setUnlockTarget(viewTarget);
                  setViewDialogOpen(false);
                  setUnlockDialogOpen(true);
                }}
                className="mr-auto"
              >
                <Unlock className="h-4 w-4 mr-2" /> Unlock Country
              </Button>
            )}
            {viewTarget && viewTarget.status === "PENDING" && (
              <>
                <Button
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20"
                  onClick={() => {
                    setReviewTarget(viewTarget);
                    setReviewStatus("REJECTED");
                    setRejectReason("");
                    setViewDialogOpen(false);
                    setReviewDialogOpen(true);
                  }}
                >
                  <XCircle className="h-4 w-4 mr-2" /> Reject
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    setReviewTarget(viewTarget);
                    setReviewStatus("APPROVED");
                    setRejectReason("");
                    setViewDialogOpen(false);
                    setReviewDialogOpen(true);
                  }}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Approve
                </Button>
              </>
            )}
            <Button variant="ghost" onClick={() => setViewDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ━━ Unlock Country Confirmation Dialog (admin) ━━ */}
      <Dialog open={unlockDialogOpen} onOpenChange={setUnlockDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Unlock Country Selection</DialogTitle>
            <DialogDescription>
              {unlockTarget && (
                <>
                  Allow <strong>{unlockTarget.user?.name}</strong> to change their country from{" "}
                  <strong>{countryLabel(unlockTarget.country)}</strong>?
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-900 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-800 dark:text-yellow-300">
                This will allow the user to select a different country and resubmit their details.
                They will be notified in-app. This action cannot be undone.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlockDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUnlockCountry} className="bg-yellow-600 hover:bg-yellow-700">
              <Unlock className="h-4 w-4 mr-2" /> Unlock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ━━ Sub-component: My Detail Section (form + read-only view) ━━

interface MyDetailSectionProps {
  hasSubmitted: boolean;
  isApproved: boolean;
  isRejected: boolean;
  isPending: boolean;
  myDetail: UserDetailResponse | null;
  showForm: boolean;
  isEditing: boolean;
  setIsEditing: (v: boolean) => void;
  formCountry: Country;
  formFullName: string;
  formGovIdType: GovIdType;
  formGovIdNumber: string;
  formBankAccountName: string;
  formBankAccountNumber: string;
  formBankSortCode: string;
  formBankName: string;
  formBankBranch: string;
  handleCountryChange: (v: Country) => void;
  setFormFullName: (v: string) => void;
  setFormGovIdType: (v: GovIdType) => void;
  setFormGovIdNumber: (v: string) => void;
  setFormBankAccountName: (v: string) => void;
  setFormBankAccountNumber: (v: string) => void;
  setFormBankSortCode: (v: string) => void;
  setFormBankName: (v: string) => void;
  setFormBankBranch: (v: string) => void;
  handleSubmit: () => void;
  submitting: boolean;
}

function MyDetailSection(props: MyDetailSectionProps) {
  const {
    hasSubmitted, isApproved, isRejected, isPending, myDetail, showForm, isEditing, setIsEditing,
    formCountry, formFullName, formGovIdType, formGovIdNumber,
    formBankAccountName, formBankAccountNumber, formBankSortCode, formBankName, formBankBranch,
    handleCountryChange, setFormFullName, setFormGovIdType, setFormGovIdNumber,
    setFormBankAccountName, setFormBankAccountNumber, setFormBankSortCode, setFormBankName, setFormBankBranch,
    handleSubmit, submitting,
  } = props;

  return (
    <div className="space-y-4">
      {/* Status banner */}
      {hasSubmitted && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3 flex-wrap">
              <StatusBadge status={myDetail!.status} />
              <div className="flex-1 min-w-0">
                {isPending && (
                  <p className="text-sm text-muted-foreground">
                    Your details are pending review by an administrator. You&apos;ll be notified once reviewed.
                  </p>
                )}
                {isApproved && (
                  <p className="text-sm text-muted-foreground">
                    Your details have been approved. Contact an admin if you need to make changes.
                  </p>
                )}
                {isRejected && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-red-700 dark:text-red-400">Your details were rejected:</p>
                    <p className="text-sm text-red-600 dark:text-red-400">{safeText(myDetail!.rejectedReason, "")}</p>
                  </div>
                )}
              </div>
              {isRejected && !isEditing && (
                <Button onClick={() => setIsEditing(true)} size="sm">
                  Edit & Resubmit
                </Button>
              )}
              {isRejected && isEditing && (
                <Button variant="outline" onClick={() => setIsEditing(false)} size="sm">
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {showForm ? (
        /* ━━ Form ━━ */
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IdCard className="h-5 w-5" />
              {hasSubmitted ? "Update Your Details" : "Submit Your Details"}
            </CardTitle>
            <CardDescription>
              {hasSubmitted
                ? "Update the rejected fields and resubmit for review."
                : "Please provide your personal, government ID, and bank account details. This information is encrypted and only visible to administrators."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Country selection */}
            <div>
              <Label className="text-sm font-medium flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Country <span className="text-destructive">*</span>
                {hasSubmitted && myDetail?.countryLocked && (
                  <Badge variant="outline" className="gap-1 ml-2 text-xs">
                    <Lock className="h-3 w-3" /> Locked
                  </Badge>
                )}
              </Label>
              <p className="text-xs text-muted-foreground mt-1 mb-3">
                Select your country of residence. This can only be set once — contact an admin to change it later.
              </p>
              <RadioGroup
                value={formCountry}
                onValueChange={(v) => handleCountryChange(v as Country)}
                className="grid gap-3 sm:grid-cols-2"
                disabled={hasSubmitted && !!myDetail?.countryLocked}
              >
                <label className={cn(
                  "flex items-center gap-3 rounded-xl border-2 p-4 cursor-pointer transition-all",
                  formCountry === "UK" ? "border-primary bg-primary/5" : "border-input hover:bg-accent",
                  (hasSubmitted && myDetail?.countryLocked) && "cursor-not-allowed opacity-70"
                )}>
                  <RadioGroupItem value="UK" disabled={hasSubmitted && !!myDetail?.countryLocked} />
                  <div className="text-2xl">🇬🇧</div>
                  <div>
                    <div className="font-medium">United Kingdom</div>
                    <div className="text-xs text-muted-foreground">NI number, sort code</div>
                  </div>
                </label>
                <label className={cn(
                  "flex items-center gap-3 rounded-xl border-2 p-4 cursor-pointer transition-all",
                  formCountry === "INDIA" ? "border-primary bg-primary/5" : "border-input hover:bg-accent",
                  (hasSubmitted && myDetail?.countryLocked) && "cursor-not-allowed opacity-70"
                )}>
                  <RadioGroupItem value="INDIA" disabled={hasSubmitted && !!myDetail?.countryLocked} />
                  <div className="text-2xl">🇮🇳</div>
                  <div>
                    <div className="font-medium">India</div>
                    <div className="text-xs text-muted-foreground">Aadhaar/PAN, IFSC</div>
                  </div>
                </label>
              </RadioGroup>
            </div>

            {formCountry && (
              <>
                {/* Personal info */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <User className="h-4 w-4" /> Personal Information
                  </h3>
                  <div>
                    <Label htmlFor="full-name" className="text-sm font-medium">
                      Full Name (as per government document) <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="full-name"
                      value={formFullName}
                      onChange={(e) => setFormFullName(e.target.value)}
                      placeholder="e.g., John Smith / Raj Kumar Patel"
                      className="mt-1.5"
                      maxLength={200}
                    />
                  </div>
                </div>

                {/* Government ID */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4" /> Government ID
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="gov-id-type" className="text-sm font-medium">
                        ID Type <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={formGovIdType}
                        onValueChange={(v) => setFormGovIdType(v as GovIdType)}
                      >
                        <SelectTrigger id="gov-id-type" className="mt-1.5">
                          <SelectValue placeholder="Select ID type" />
                        </SelectTrigger>
                        <SelectContent>
                          {formCountry === "INDIA" && (
                            <>
                              <SelectItem value="AADHAAR">Aadhaar</SelectItem>
                              <SelectItem value="PAN">PAN</SelectItem>
                            </>
                          )}
                          {formCountry === "UK" && (
                            <SelectItem value="NI">National Insurance (NI)</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="gov-id-number" className="text-sm font-medium">
                        ID Number <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="gov-id-number"
                        value={formGovIdNumber}
                        onChange={(e) => setFormGovIdNumber(e.target.value)}
                        placeholder={
                          formGovIdType === "AADHAAR" ? "1234 5678 9012" :
                          formGovIdType === "PAN" ? "ABCDE1234F" :
                          formGovIdType === "NI" ? "QQ 123456 C" : "Select ID type first"
                        }
                        className="mt-1.5"
                        autoComplete="off"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {formGovIdType === "AADHAAR" && "12-digit number (cannot start with 0 or 1)"}
                        {formGovIdType === "PAN" && "Format: 5 letters + 4 digits + 1 letter"}
                        {formGovIdType === "NI" && "Format: 2 letters + 6 digits + 1 letter (A-D)"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Bank details */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Landmark className="h-4 w-4" /> Bank Account Details
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label htmlFor="bank-account-name" className="text-sm font-medium">
                        Account Holder Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="bank-account-name"
                        value={formBankAccountName}
                        onChange={(e) => setFormBankAccountName(e.target.value)}
                        placeholder="Name as it appears on the bank account"
                        className="mt-1.5"
                        maxLength={200}
                      />
                    </div>
                    <div>
                      <Label htmlFor="bank-account-number" className="text-sm font-medium">
                        Account Number <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="bank-account-number"
                        value={formBankAccountNumber}
                        onChange={(e) => setFormBankAccountNumber(e.target.value)}
                        placeholder="e.g., 1234567890"
                        className="mt-1.5"
                        inputMode="numeric"
                        autoComplete="off"
                      />
                      <p className="text-xs text-muted-foreground mt-1">6-20 digits, numbers only</p>
                    </div>
                    <div>
                      <Label htmlFor="bank-sort-code" className="text-sm font-medium">
                        {formCountry === "UK" ? "Sort Code" : "IFSC Code"} <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="bank-sort-code"
                        value={formBankSortCode}
                        onChange={(e) => setFormBankSortCode(e.target.value)}
                        placeholder={formCountry === "UK" ? "12-34-56" : "ABCD0123456"}
                        className="mt-1.5"
                        autoComplete="off"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {formCountry === "UK" ? "6 digits (XX-XX-XX format)" : "4 letters + 0 + 6 alphanumeric"}
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="bank-name" className="text-sm font-medium">
                        Bank Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="bank-name"
                        value={formBankName}
                        onChange={(e) => setFormBankName(e.target.value)}
                        placeholder="e.g., Barclays Bank / State Bank of India"
                        className="mt-1.5"
                        maxLength={200}
                      />
                    </div>
                    {formCountry === "INDIA" && (
                      <div>
                        <Label htmlFor="bank-branch" className="text-sm font-medium">
                          Branch Name <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="bank-branch"
                          value={formBankBranch}
                          onChange={(e) => setFormBankBranch(e.target.value)}
                          placeholder="e.g., MG Road, Bangalore"
                          className="mt-1.5"
                          maxLength={200}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Security notice */}
                <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-900 p-3">
                  <div className="flex items-start gap-2">
                    <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-800 dark:text-blue-300">
                      Your government ID and bank account number are encrypted at rest using AES-256-GCM.
                      Only the last 4 digits will be displayed after submission. Administrators see the same masked view.
                    </p>
                  </div>
                </div>

                {isRejected && isEditing && (
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-900 p-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-yellow-800 dark:text-yellow-300">
                        You&apos;re editing rejected details. Re-enter your government ID number and bank account number
                        (these fields are not pre-filled for security reasons), then resubmit.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  {isEditing && (
                    <Button variant="outline" onClick={() => setIsEditing(false)}>
                      Cancel
                    </Button>
                  )}
                  <Button onClick={handleSubmit} disabled={submitting}>
                    {submitting ? (
                      <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Submitting...</>
                    ) : (
                      <><Save className="h-4 w-4 mr-2" /> {hasSubmitted ? "Resubmit for Review" : "Submit for Review"}</>
                    )}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        /* ━━ Read-only details view ━━ */
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IdCard className="h-5 w-5" /> Your Submitted Details
            </CardTitle>
            <CardDescription>
              {isApproved
                ? "Your details have been approved and are read-only. Contact an admin to make changes."
                : isPending
                ? "Your details are pending review."
                : "Your submitted details."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailField icon={Building2} label="Country" value={countryLabel(myDetail?.country || null)} />
              <DetailField icon={User} label="Full Name (as per ID)" value={myDetail?.fullNameAsPerId} />
              <DetailField icon={FileText} label="Government ID Type" value={govIdTypeLabel(myDetail?.govIdType || null)} />
              <DetailField icon={IdCard} label="Government ID Number" value={myDetail?.govIdNumberMasked || "—"} mono />
              <DetailField icon={User} label="Bank Account Holder Name" value={myDetail?.bankAccountName} />
              <DetailField icon={Landmark} label="Bank Account Number" value={myDetail?.bankAccountNumberMasked || "—"} mono />
              <DetailField icon={Building2} label={sortCodeLabel(myDetail?.country || null)} value={myDetail?.bankSortCode} mono />
              <DetailField icon={Building2} label="Bank Name" value={myDetail?.bankName} />
              {myDetail?.country === "INDIA" && (
                <DetailField icon={Building2} label="Bank Branch" value={myDetail?.bankBranch} />
              )}
            </div>

            {myDetail?.countryLocked && (
              <div className="rounded-lg border border-muted bg-muted/30 p-3">
                <div className="flex items-start gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    Your country is locked. Contact an administrator if you need to change it.
                  </p>
                </div>
              </div>
            )}

            {myDetail?.reviewedAt && (
              <p className="text-xs text-muted-foreground">
                {isApproved ? "Approved" : "Reviewed"} on {formatDateTime(myDetail.reviewedAt)}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ━━ Sub-component: Detail Field (read-only display) ━━

interface DetailFieldProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}

function DetailField({ icon: Icon, label, value, mono }: DetailFieldProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className={cn(
        "text-sm py-1.5 px-3 rounded-md bg-muted/40 min-h-[36px] flex items-center",
        mono && "font-mono"
      )}>
        {safeText(value, "—") || "—"}
      </div>
    </div>
  );
}
