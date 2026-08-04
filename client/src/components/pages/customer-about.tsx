
import type { AppCustomer } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  User, CalendarDays, Clock, ShieldCheck,
  CheckCircle2, TrendingUp, AlertTriangle, Mail, CreditCard,
} from "lucide-react";

interface Props {
  customer?: AppCustomer;
}

export default function CustomerAbout({ customer }: Props) {
  if (!customer) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const daysRemaining = Math.ceil(
    (new Date(customer.subscription_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const progressPercent = (() => {
    const total = new Date(customer.subscription_end).getTime() - new Date(customer.subscription_start).getTime();
    const elapsed = Date.now() - new Date(customer.subscription_start).getTime();
    return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
  })();

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-6 sm:p-8 text-white shadow-lg shadow-emerald-500/20">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-100 text-sm mb-2">
              <CheckCircle2 className="w-4 h-4" />
              Subscription Active
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              Welcome, {customer.name}!
            </h1>
            <p className="text-emerald-100 mt-1">
              Your account is active. You can access all features and manage your data.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-white/15 backdrop-blur rounded-xl px-5 py-3 text-center">
              <div className="text-3xl font-bold">{daysRemaining}</div>
              <div className="text-emerald-100 text-xs mt-0.5">Days Left</div>
            </div>
            {daysRemaining <= 7 && (
              <div className="hidden sm:flex items-center gap-2 bg-amber-500/20 backdrop-blur rounded-xl px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-300" />
                <span className="text-xs text-amber-200">Expiring soon</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Account Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                <User className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <div className="text-xs text-slate-500">Account Name</div>
                <div className="font-semibold text-slate-800">{customer.name}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="text-xs text-slate-500">Subscription</div>
                <div className="font-semibold text-slate-800 capitalize">{customer.subscription_type}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center">
                <CalendarDays className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <div className="text-xs text-slate-500">Start Date</div>
                <div className="font-semibold text-slate-800">{customer.subscription_start}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <div className="text-xs text-slate-500">Expiry Date</div>
                <div className="font-semibold text-slate-800">{customer.subscription_end}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Subscription Progress */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-500" />
            Subscription Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">{customer.subscription_start}</span>
              <span className="text-slate-500">{customer.subscription_end}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${
                  daysRemaining <= 7 ? "bg-gradient-to-r from-red-400 to-red-500"
                  : daysRemaining <= 15 ? "bg-gradient-to-r from-amber-400 to-amber-500"
                  : "bg-gradient-to-r from-emerald-400 to-teal-500"
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">{progressPercent}% elapsed</span>
              <span className={daysRemaining <= 7 ? "text-red-500 font-medium" : "text-slate-400"}>
                {daysRemaining} days remaining
              </span>
            </div>
          </div>

          {daysRemaining <= 7 && (
            <div className="mt-4 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-800">
                <div className="font-medium">Your subscription is expiring soon!</div>
                <div className="text-amber-600 mt-0.5">
                  Only {daysRemaining} days remaining. Please contact the admin to renew your subscription.
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Account Details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            Account Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <Mail className="w-4 h-4 text-slate-400" />
              <div>
                <div className="text-xs text-slate-400">Email</div>
                <div className="text-sm font-medium text-slate-700">{customer.email}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Active</Badge>
              <div>
                <div className="text-xs text-slate-400">Status</div>
                <div className="text-sm font-medium text-slate-700">Account Active</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}