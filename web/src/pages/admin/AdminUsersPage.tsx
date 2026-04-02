import { useState, useEffect, useCallback } from "react";
import { CheckCircle, XCircle, Loader2, PauseCircle, PlayCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { adminService } from "@/api/admin";
import type { PendingUser, AdminUserListResponse, ApprovalLogItem, ApprovalLogResponse } from "@/api/admin";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

function statusBadge(isActive: boolean) {
  return isActive
    ? <Badge variant="outline" className="text-green-600 border-green-400">활성</Badge>
    : <Badge variant="outline" className="text-gray-500 border-gray-300">정지</Badge>;
}

function actionBadge(action: string) {
  if (action === "가입 신청") return <Badge variant="outline" className="text-blue-600 border-blue-300">가입 신청</Badge>;
  if (action === "승인") return <Badge variant="outline" className="text-green-600 border-green-400">승인</Badge>;
  if (action === "거절") return <Badge variant="outline" className="text-red-600 border-red-400">거절</Badge>;
  return <Badge variant="outline">{action}</Badge>;
}

function roleLabel(role: string) {
  const map: Record<string, string> = { PI: "연구책임자", CRC: "코디네이터", ADMIN: "관리자", STEERING: "운영위원", AUDITOR: "감사" };
  return map[role] ?? role;
}

interface RejectDialogProps {
  user: PendingUser | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  loading: boolean;
}

function RejectDialog({ user, onClose, onConfirm, loading }: RejectDialogProps) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={!!user} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>회원가입 거절</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-gray-600">
            <span className="font-medium">{user?.full_name}</span> ({user?.login_id}) 님의 가입 신청을 거절하시겠습니까?
          </p>
          <div>
            <label className="block text-sm text-gray-700 mb-1">거절 사유 (선택)</label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="거절 사유를 입력하세요"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>취소</Button>
          <Button variant="destructive" onClick={() => onConfirm(reason)} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            거절
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdminUsersPage() {
  const { token } = useAuth();
  const [pendingData, setPendingData] = useState<AdminUserListResponse | null>(null);
  const [allData, setAllData] = useState<AdminUserListResponse | null>(null);
  const [logData, setLogData] = useState<ApprovalLogResponse | null>(null);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [allLoading, setAllLoading] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PendingUser | null>(null);
  const [error, setError] = useState("");
  const [pendingPage, setPendingPage] = useState(1);
  const [allPage, setAllPage] = useState(1);
  const [logPage, setLogPage] = useState(1);

  const fetchPending = useCallback(() => {
    if (!token) return;
    setPendingLoading(true);
    adminService.listPendingUsers(token, pendingPage)
      .then(setPendingData)
      .catch((err) => setError(err instanceof Error ? err.message : "오류가 발생했습니다."))
      .finally(() => setPendingLoading(false));
  }, [token, pendingPage]);

  const fetchAll = useCallback(() => {
    if (!token) return;
    setAllLoading(true);
    adminService.listUsers(token, allPage)
      .then(setAllData)
      .catch((err) => setError(err instanceof Error ? err.message : "오류가 발생했습니다."))
      .finally(() => setAllLoading(false));
  }, [token, allPage]);

  const fetchLogs = useCallback(() => {
    if (!token) return;
    setLogLoading(true);
    adminService.listLogs(token, logPage)
      .then(setLogData)
      .catch((err) => setError(err instanceof Error ? err.message : "오류가 발생했습니다."))
      .finally(() => setLogLoading(false));
  }, [token, logPage]);

  useEffect(() => { fetchPending(); }, [fetchPending]);
  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleApprove = async (user: PendingUser) => {
    if (!token) return;
    setActionLoading(user.user_id);
    setError("");
    try {
      await adminService.approveUser(user.user_id, token);
      fetchPending();
      fetchAll();
      fetchLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "승인에 실패했습니다.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (reason: string) => {
    if (!token || !rejectTarget) return;
    setActionLoading(rejectTarget.user_id);
    setError("");
    try {
      await adminService.rejectUser(rejectTarget.user_id, { reason: reason || undefined }, token);
      setRejectTarget(null);
      fetchPending();
      fetchAll();
      fetchLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "거절에 실패했습니다.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleActive = async (user: PendingUser) => {
    if (!token) return;
    setActionLoading(user.user_id);
    setError("");
    try {
      if (user.is_active) {
        await adminService.suspendUser(user.user_id, token);
      } else {
        await adminService.activateUser(user.user_id, token);
      }
      fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "상태 변경에 실패했습니다.");
    } finally {
      setActionLoading(null);
    }
  };

  if (!token) {
    return (
      <div className="p-8 text-center text-gray-500 text-sm">
        실제 계정으로 로그인 후 이용할 수 있습니다.
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl text-gray-900 mb-1">사용자 관리</h1>
        <p className="text-gray-500 text-sm">회원가입 승인 및 사용자 계정을 관리합니다.</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <Tabs defaultValue="pending">
        <TabsList className="mb-4">
          <TabsTrigger value="pending">
            승인 대기
            {pendingData && pendingData.pagination.total_elements > 0 && (
              <span className="ml-2 bg-yellow-100 text-yellow-700 text-xs font-medium px-2 py-0.5 rounded-full">
                {pendingData.pagination.total_elements}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">전체 사용자</TabsTrigger>
          <TabsTrigger value="logs">로그</TabsTrigger>
        </TabsList>

        {/* Tab 1: Pending Users */}
        <TabsContent value="pending">
          {pendingLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : !pendingData || pendingData.items.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">승인 대기 중인 사용자가 없습니다.</div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full min-w-[700px] text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">이름</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">아이디</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">역할</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">병원</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">이메일</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">신청일</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pendingData.items.map((user) => (
                    <tr key={user.user_id} className="bg-white hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{user.full_name}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{user.login_id}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{roleLabel(user.role_code)}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{user.hospital_code ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{user.email ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {new Date(user.created_at).toLocaleDateString("ko-KR")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-700 border-green-300 hover:bg-green-50"
                            onClick={() => handleApprove(user)}
                            disabled={actionLoading === user.user_id}
                          >
                            {actionLoading === user.user_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                            승인
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-700 border-red-300 hover:bg-red-50"
                            onClick={() => setRejectTarget(user)}
                            disabled={actionLoading === user.user_id}
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            거절
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pendingData && pendingData.pagination.total_pages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <Button variant="outline" size="sm" disabled={pendingPage <= 1} onClick={() => setPendingPage((p) => p - 1)}>이전</Button>
              <span className="flex items-center text-sm text-gray-600">
                {pendingPage} / {pendingData.pagination.total_pages}
              </span>
              <Button variant="outline" size="sm" disabled={pendingPage >= pendingData.pagination.total_pages} onClick={() => setPendingPage((p) => p + 1)}>다음</Button>
            </div>
          )}
        </TabsContent>

        {/* Tab 2: All Users */}
        <TabsContent value="all">
          {allLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : !allData || allData.items.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">사용자가 없습니다.</div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full min-w-[800px] text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">이름</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">아이디</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">역할</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">병원</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">상태</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">가입일</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">마지막 로그인</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {allData.items.map((user) => (
                    <tr key={user.user_id} className="bg-white hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{user.full_name}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{user.login_id}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{roleLabel(user.role_code)}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{user.hospital_code ?? "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{statusBadge(user.is_active)}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {new Date(user.created_at).toLocaleDateString("ko-KR")}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {user.last_login_at ? new Date(user.last_login_at).toLocaleDateString("ko-KR") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {user.approval_status === "APPROVED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className={user.is_active
                              ? "text-orange-700 border-orange-300 hover:bg-orange-50"
                              : "text-green-700 border-green-300 hover:bg-green-50"
                            }
                            onClick={() => handleToggleActive(user)}
                            disabled={actionLoading === user.user_id}
                          >
                            {actionLoading === user.user_id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : user.is_active ? (
                              <><PauseCircle className="w-3 h-3 mr-1" />정지</>
                            ) : (
                              <><PlayCircle className="w-3 h-3 mr-1" />활성화</>
                            )}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {allData && allData.pagination.total_pages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <Button variant="outline" size="sm" disabled={allPage <= 1} onClick={() => setAllPage((p) => p - 1)}>이전</Button>
              <span className="flex items-center text-sm text-gray-600">
                {allPage} / {allData.pagination.total_pages}
              </span>
              <Button variant="outline" size="sm" disabled={allPage >= allData.pagination.total_pages} onClick={() => setAllPage((p) => p + 1)}>다음</Button>
            </div>
          )}
        </TabsContent>

        {/* Tab 3: Approval Logs */}
        <TabsContent value="logs">
          {logLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : !logData || logData.items.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">로그가 없습니다.</div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">구분</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">이름</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">아이디</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">역할</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">병원</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">처리자</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">거절 사유</th>
                    <th className="px-4 py-3 text-left font-medium whitespace-nowrap">일시</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {logData.items.map((log: ApprovalLogItem, idx: number) => (
                    <tr key={`${log.user_id}-${log.action}-${idx}`} className="bg-white hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">{actionBadge(log.action)}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{log.full_name}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{log.login_id}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{roleLabel(log.role_code)}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{log.hospital_code ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{log.actor_name ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{log.rejection_reason ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {new Date(log.acted_at).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {logData && logData.pagination.total_pages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <Button variant="outline" size="sm" disabled={logPage <= 1} onClick={() => setLogPage((p) => p - 1)}>이전</Button>
              <span className="flex items-center text-sm text-gray-600">
                {logPage} / {logData.pagination.total_pages}
              </span>
              <Button variant="outline" size="sm" disabled={logPage >= logData.pagination.total_pages} onClick={() => setLogPage((p) => p + 1)}>다음</Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <RejectDialog
        user={rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleReject}
        loading={actionLoading === rejectTarget?.user_id}
      />
    </div>
  );
}
