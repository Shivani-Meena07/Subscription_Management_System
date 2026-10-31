import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value) || 0);

export default function RevenueChart({ data }) {
  return <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
    <defs><linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#51846f" stopOpacity={0.17} /><stop offset="95%" stopColor="#51846f" stopOpacity={0} /></linearGradient></defs>
    <CartesianGrid vertical={false} stroke="#edf0eb" strokeDasharray="3 5" />
    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#858a81', fontSize: 11 }} dy={10} />
    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#858a81', fontSize: 11 }} tickFormatter={(value) => value >= 1000 ? `₹${value / 1000}k` : `₹${value}`} />
    <Tooltip formatter={(value) => money(value)} contentStyle={{ borderRadius: 8, border: '1px solid #e8ebe6', fontSize: 12, boxShadow: '0 4px 16px #2221' }} />
    <Area type="monotone" dataKey="revenue" stroke="#548671" strokeWidth={2.2} fill="url(#revenueFill)" activeDot={{ r: 4, fill: '#548671' }} />
  </AreaChart></ResponsiveContainer></div>;
}
