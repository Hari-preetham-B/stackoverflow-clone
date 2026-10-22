import Mainlayout from "@/layout/Mainlayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import axiosInstance from "@/lib/axiosinstance";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";

type AdminUser = {
  _id: string;
  name: string;
  email: string;
  role: string;
  reputation: number;
  subscriptionPlan?: string;
  createdAt: string;
  isSuspended?: boolean;
  suspendedUntil?: string | null;
  suspensionReason?: string | null;
};

export default function AdminPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [contentReports, setContentReports] = useState<any[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [suspendForm, setSuspendForm] = useState<{ id: string; reason: string; days: string } | null>(null);

  const load = async () => {
    try {
      const [r, a, c, u] = await Promise.all([
        axiosInstance.get("/admin/reports"),
        axiosInstance.get("/admin/login-activity"),
        axiosInstance.get("/admin/content-reports"),
        axiosInstance.get("/admin/users"),
      ]);
      setReports(r.data.data);
      setActivity(a.data.data);
      setContentReports(c.data.data);
      setUsers(u.data.data || []);
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Admin access required");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateContent = async (id: string, status: string) => {
    try {
      await axiosInstance.patch(`/admin/content-reports/${id}`, { status });
      toast.success("Updated");
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Failed");
    }
  };

  const update = async (id: string, status: string) => {
    try {
      await axiosInstance.patch(`/admin/reports/${id}`, { status });
      toast.success("Updated");
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Failed");
    }
  };

  const suspend = async (user: AdminUser) => {
    const reason = (suspendForm?.reason || "").trim();
    if (!reason) {
      toast.error("A suspension reason is required");
      return;
    }
    setBusyId(user._id);
    try {
      await axiosInstance.post(`/admin/users/${user._id}/suspend`, {
        reason,
        durationDays: suspendForm?.days ? Number(suspendForm.days) : undefined,
      });
      toast.success(`${user.name} suspended`);
      setSuspendForm(null);
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Failed to suspend user");
    } finally {
      setBusyId(null);
    }
  };

  const unsuspend = async (user: AdminUser) => {
    setBusyId(user._id);
    try {
      await axiosInstance.post(`/admin/users/${user._id}/unsuspend`, {});
      toast.success(`${user.name} reinstated`);
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Failed to reinstate user");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Mainlayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <h1 className="sr-only">Administration</h1>
        <Card>
          <CardHeader>
            <CardTitle>User management</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-600">
              Suspend a repeat offender. A suspension blocks the community write operations and revokes the
              account&apos;s active sessions. Reading stays available. Omit the duration for an indefinite
              suspension; a duration of 1&ndash;365 days lapses automatically.
            </p>

            {users.length === 0 && <p className="text-sm text-gray-500">No users to display.</p>}

            {users.map((user) => {
              const isAdmin = user.role === "admin";
              const form = suspendForm?.id === user._id ? suspendForm : null;
              return (
                <div key={user._id} className="border rounded p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium break-words">
                        {user.name}
                        {isAdmin && <span className="ml-2 text-xs text-gray-500">(admin)</span>}
                        {user.isSuspended && (
                          <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">Suspended</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 break-words">
                        {user.email} &middot; {user.reputation} rep &middot; {user.subscriptionPlan || "free"}
                      </p>
                      {user.isSuspended && user.suspensionReason && (
                        <p className="text-xs text-red-700 mt-1 break-words">
                          Reason: {user.suspensionReason}
                          {user.suspendedUntil ? ` · until ${new Date(user.suspendedUntil).toLocaleString()}` : " · indefinite"}
                        </p>
                      )}
                    </div>

                    {isAdmin ? (
                      <span className="text-xs text-gray-500">Administrators cannot be suspended</span>
                    ) : user.isSuspended ? (
                      <Button size="sm" variant="outline" disabled={busyId === user._id} onClick={() => unsuspend(user)}>
                        {busyId === user._id ? "Working…" : "Unsuspend"}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSuspendForm(form ? null : { id: user._id, reason: "", days: "" })}
                      >
                        {form ? "Cancel" : "Suspend"}
                      </Button>
                    )}
                  </div>

                  {form && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_9rem_auto]">
                      <Input
                        placeholder="Reason (required)"
                        value={form.reason}
                        onChange={(e) => setSuspendForm({ ...form, reason: e.target.value })}
                      />
                      <Input
                        type="number"
                        min={1}
                        max={365}
                        placeholder="Days (optional)"
                        value={form.days}
                        onChange={(e) => setSuspendForm({ ...form, days: e.target.value })}
                      />
                      <Button size="sm" variant="destructive" disabled={busyId === user._id} onClick={() => suspend(user)}>
                        {busyId === user._id ? "Working…" : "Confirm suspension"}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Community moderation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {reports.map((r) => (
              <div key={r._id} className="border rounded p-3">
                <p className="text-sm">{r.reason}</p>
                <p className="text-xs text-gray-500 mb-2">Reporter: {r.reporterId?.name}</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => update(r._id, "reviewed")}>Review</Button>
                  <Button size="sm" variant="outline" onClick={() => update(r._id, "dismissed")}>Dismiss</Button>
                  <Button size="sm" variant="outline" onClick={() => update(r._id, "removed")}>Remove post</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Question flags</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {contentReports.map((r) => (
              <div key={r._id} className="border rounded p-3">
                <p className="font-semibold break-words">{r.questionId?.questiontitle}</p>
                <p className="text-sm break-words">{r.reason}</p>
                <div className="flex gap-2 mt-2">
                  <Button size="sm" onClick={() => updateContent(r._id, "reviewed")}>Review</Button>
                  <Button size="sm" variant="outline" onClick={() => updateContent(r._id, "dismissed")}>Dismiss</Button>
                  <Button size="sm" variant="outline" onClick={() => updateContent(r._id, "removed")}>Remove question</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Login activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {activity.map((a) => (
              <div key={a._id} className="text-sm border-b pb-1">
                {a.userId?.name || "Unknown user"} &middot; {a.status} &middot; {new Date(a.createdAt).toLocaleString()}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </Mainlayout>
  );
}
