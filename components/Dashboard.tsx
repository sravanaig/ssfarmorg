import React, { useMemo, useState, useEffect, useRef } from 'react';
import type { Customer, Delivery, Payment, Order, PendingDelivery } from '../types';
import { TruckIcon, BillIcon, CreditCardIcon, UsersIcon, CheckIcon } from './Icons';

// This is a global from the CDN script in index.html
declare const Chart: any;

interface DashboardProps {
    customers: Customer[];
    deliveries: Delivery[];
    payments: Payment[];
    orders: Order[];
    pendingDeliveries: PendingDelivery[];
}

const StatCard: React.FC<{
    title: string;
    value: string;
    subtitle?: string;
    icon: React.ReactNode;
    color: string;
}> = ({ title, value, subtitle, icon, color }) => {
    return (
        <div className="bg-white p-6 rounded-lg shadow-md flex items-center space-x-4">
            <div className={`p-3 rounded-full ${color}`}>
                {icon}
            </div>
            <div>
                <p className="text-sm font-medium text-gray-500">{title}</p>
                <p className="text-2xl font-bold text-gray-800">{value}</p>
                {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
            </div>
        </div>
    );
};


const Dashboard: React.FC<DashboardProps> = ({ customers, deliveries, payments, orders, pendingDeliveries }) => {
    
    const [summaryDate, setSummaryDate] = useState(new Date().toISOString().split('T')[0]);
    const [summaryMonth, setSummaryMonth] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM

    const barChartRef = useRef<HTMLCanvasElement>(null);
    const barChartInstance = useRef<any>(null);
    const pieChartRef = useRef<HTMLCanvasElement>(null);
    const pieChartInstance = useRef<any>(null);
    
    const stats = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];
        const currentMonth = today.substring(0, 7); // YYYY-MM
        
        const customerMap: Map<string, Customer> = new Map(customers.filter(c => c && c.id).map(c => [c.id, c]));

        // Today's Deliveries
        const todaysDeliveries = deliveries.filter(d => d.date === today);
        const totalQuantityToday = todaysDeliveries.reduce((sum, d) => sum + d.quantity, 0);
        const customersServedToday = new Set(todaysDeliveries.map(d => d.customerId)).size;

        // Month-to-Date Revenue
        const monthlyDeliveries = deliveries.filter(d => d.date.startsWith(currentMonth));
        const mtdRevenue = monthlyDeliveries.reduce((sum, d) => {
            const customer = customerMap.get(d.customerId);
            return sum + (d.quantity * (customer?.milkPrice || 0));
        }, 0);
        
        // Month-to-Date Payments
        const mtdPayments = payments
            .filter(p => p.date.startsWith(currentMonth))
            .reduce((sum, p) => sum + p.amount, 0);
        
        // Total Outstanding Balance
        const totalDue = deliveries.reduce((sum, d) => {
            const customer = customerMap.get(d.customerId);
            return sum + (d.quantity * (customer?.milkPrice || 0));
        }, 0);
        const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
        const totalOutstanding = totalDue - totalPaid;
        
        // Customer stats
        const activeCustomers = customers.filter(c => c.status === 'active').length;

        // Pending Deliveries
        const pendingDeliveriesCount = pendingDeliveries.length;

        return {
            totalQuantityToday,
            customersServedToday,
            mtdRevenue,
            mtdPayments,
            totalOutstanding,
            activeCustomers,
            pendingDeliveriesCount,
        };
    }, [customers, deliveries, payments, pendingDeliveries]);
    
    const dailySummary = useMemo(() => {
        const customerMap: Map<string, Customer> = new Map(customers.filter(c => c && c.id).map(c => [c.id, c]));
        const deliveriesForDate = deliveries.filter(d => d.date === summaryDate);

        const totalQuantity = deliveriesForDate.reduce((sum, d) => sum + d.quantity, 0);
        const customersServed = new Set(deliveriesForDate.map(d => d.customerId)).size;
        const totalRevenue = deliveriesForDate.reduce((sum, d) => {
            const customer = customerMap.get(d.customerId);
            return sum + (d.quantity * (customer?.milkPrice || 0));
        }, 0);

        return {
            totalQuantity,
            customersServed,
            totalRevenue,
        };
    }, [customers, deliveries, summaryDate]);

    const monthlySummary = useMemo(() => {
        if (!summaryMonth) return { totalQuantity: 0, customersServed: 0, totalRevenue: 0 };
        
        const customerMap: Map<string, Customer> = new Map(customers.filter(c => c && c.id).map(c => [c.id, c]));
        const deliveriesForMonth = deliveries.filter(d => d.date.startsWith(summaryMonth));

        const totalQuantity = deliveriesForMonth.reduce((sum, d) => sum + d.quantity, 0);
        const customersServed = new Set(deliveriesForMonth.map(d => d.customerId)).size;
        const totalRevenue = deliveriesForMonth.reduce((sum, d) => {
            const customer = customerMap.get(d.customerId);
            return sum + (d.quantity * (customer?.milkPrice || 0));
        }, 0);

        return {
            totalQuantity,
            customersServed,
            totalRevenue,
        };
    }, [customers, deliveries, summaryMonth]);

    // Bar Chart: Daily Delivered vs. Ordered
    useEffect(() => {
        if (!barChartRef.current || typeof Chart === 'undefined') return;

        const labels: string[] = [];
        const deliveredData: number[] = [];
        const orderedData: number[] = [];

        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateString = d.toISOString().split('T')[0];
            
            labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));

            const totalDelivered = deliveries.filter(del => del.date === dateString).reduce((sum, del) => sum + del.quantity, 0);
            deliveredData.push(totalDelivered);

            const totalOrdered = orders.filter(ord => ord.date === dateString).reduce((sum, ord) => sum + ord.quantity, 0);
            orderedData.push(totalOrdered);
        }

        const ctx = barChartRef.current.getContext('2d');
        if (!ctx) return;
        
        if (barChartInstance.current) {
            barChartInstance.current.destroy();
        }

        barChartInstance.current = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Delivered (L)', data: deliveredData, backgroundColor: 'rgba(54, 162, 235, 0.6)', borderColor: 'rgba(54, 162, 235, 1)', borderWidth: 1 },
                    { label: 'Ordered (L)', data: orderedData, backgroundColor: 'rgba(255, 159, 64, 0.6)', borderColor: 'rgba(255, 159, 64, 1)', borderWidth: 1 },
                ],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, title: { display: true, text: 'Quantity (Liters)' } } },
                plugins: { legend: { position: 'top' }, tooltip: { mode: 'index', intersect: false } },
            },
        });

        return () => {
            if (barChartInstance.current) {
                barChartInstance.current.destroy();
            }
        };
    }, [deliveries, orders]);

    // Pie Chart: Customer Distribution
    useEffect(() => {
        if (!pieChartRef.current || typeof Chart === 'undefined') return;

        const customerMap = new Map(customers.map(c => [c.id, c.name]));
        const deliveriesForMonth = deliveries.filter(d => d.date.startsWith(summaryMonth));
        
        const quantityByCustomer = new Map<string, number>();
        deliveriesForMonth.forEach(delivery => {
            const name = customerMap.get(delivery.customerId) || 'Unknown';
            quantityByCustomer.set(name, (quantityByCustomer.get(name) || 0) + delivery.quantity);
        });

        const sortedCustomers = Array.from(quantityByCustomer.entries()).sort((a, b) => b[1] - a[1]);
        const topCustomers = sortedCustomers.slice(0, 7);
        const otherCustomers = sortedCustomers.slice(7);

        const labels = topCustomers.map(c => c[0]);
        const data = topCustomers.map(c => c[1]);
        
        if (otherCustomers.length > 0) {
            labels.push('Others');
            data.push(otherCustomers.reduce((sum, c) => sum + c[1], 0));
        }

        const ctx = pieChartRef.current.getContext('2d');
        if (!ctx) return;
        
        if (pieChartInstance.current) {
            pieChartInstance.current.destroy();
        }

        pieChartInstance.current = new Chart(ctx, {
            type: 'pie',
            data: {
                labels,
                datasets: [{
                    label: 'Quantity (L)',
                    data,
                    backgroundColor: ['#4A90E2', '#50E3C2', '#F5A623', '#F8E71C', '#BD10E0', '#9013FE', '#417505', '#7ED321'],
                    hoverOffset: 4,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right' },
                    // Fix: The `raw` property on the chart.js tooltip item can be of an unknown type.
                    // A type guard is used to ensure it is a number before calling `.toFixed()` to prevent errors.
                    tooltip: { callbacks: { label: (c: any) => `${String(c.label ?? '')}: ${typeof c.raw === 'number' ? c.raw.toFixed(2) : '0.00'} L` } },
                },
            },
        });
        
        return () => {
            if (pieChartInstance.current) {
                pieChartInstance.current.destroy();
            }
        };
    }, [customers, deliveries, summaryMonth]);


    return (
        <div>
            <h2 className="text-3xl font-bold text-gray-800 mb-6">Dashboard</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <StatCard
                    title="Today's Deliveries"
                    value={`${stats.totalQuantityToday.toFixed(2)} L`}
                    subtitle={`${stats.customersServedToday} customers`}
                    icon={<TruckIcon className="h-6 w-6 text-white"/>}
                    color="bg-blue-500"
                />
                <StatCard
                    title="Month-to-Date Revenue"
                    value={`₹${stats.mtdRevenue.toFixed(2)}`}
                    icon={<BillIcon className="h-6 w-6 text-white"/>}
                    color="bg-green-500"
                />
                 <StatCard
                    title="Payments Received (Month)"
                    value={`₹${stats.mtdPayments.toFixed(2)}`}
                    icon={<CreditCardIcon className="h-6 w-6 text-white"/>}
                    color="bg-emerald-500"
                />
                <StatCard
                    title="Total Outstanding Balance"
                    value={`₹${stats.totalOutstanding.toFixed(2)}`}
                    icon={<CreditCardIcon className="h-6 w-6 text-white"/>}
                    color="bg-red-500"
                />
                <StatCard
                    title="Pending Deliveries"
                    value={`${stats.pendingDeliveriesCount}`}
                    subtitle="Awaiting admin approval"
                    icon={<CheckIcon className="h-6 w-6 text-white"/>}
                    color="bg-yellow-500"
                />
                <StatCard
                    title="Active Customers"
                    value={`${stats.activeCustomers}`}
                    icon={<UsersIcon className="h-6 w-6 text-white"/>}
                    color="bg-teal-500"
                />
            </div>
            
            <div className="mt-8 pt-6 border-t border-gray-200">
                <h3 className="text-2xl font-bold text-gray-800 mb-4">Delivery Analytics</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-lg shadow-md">
                        <h4 className="text-lg font-semibold text-gray-700 mb-4">Past 7 Days: Delivered vs. Ordered</h4>
                        <div className="relative h-80">
                            <canvas ref={barChartRef}></canvas>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-lg shadow-md">
                        <h4 className="text-lg font-semibold text-gray-700 mb-4">
                            Customer Distribution for {new Date(summaryMonth + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}
                        </h4>
                        <div className="relative h-80">
                             {deliveries.filter(d => d.date.startsWith(summaryMonth)).length > 0 ? (
                                <canvas ref={pieChartRef}></canvas>
                             ) : (
                                <div className="flex items-center justify-center h-full text-gray-500">
                                    No delivery data for this month.
                                </div>
                             )}
                        </div>
                    </div>
                </div>
            </div>
            
             <div className="mt-8 pt-6 border-t border-gray-200">
                <div className="flex flex-col md:flex-row justify-between md:items-center mb-4 gap-4">
                    <h3 className="text-2xl font-bold text-gray-800">Daily Summary</h3>
                    <div className="flex items-center gap-2">
                         <label htmlFor="summary-date" className="text-sm font-medium text-gray-700">Select Date:</label>
                        <input
                            id="summary-date"
                            type="date"
                            value={summaryDate}
                            onChange={(e) => setSummaryDate(e.target.value)}
                            className="border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <StatCard
                        title="Total Milk Delivered"
                        value={`${dailySummary.totalQuantity.toFixed(2)} L`}
                        icon={<TruckIcon className="h-6 w-6 text-white"/>}
                        color="bg-purple-500"
                    />
                    <StatCard
                        title="Revenue for Day"
                        value={`₹${dailySummary.totalRevenue.toFixed(2)}`}
                        icon={<BillIcon className="h-6 w-6 text-white"/>}
                        color="bg-yellow-600"
                    />
                    <StatCard
                        title="Customers Served"
                        value={`${dailySummary.customersServed}`}
                        icon={<UsersIcon className="h-6 w-6 text-white"/>}
                        color="bg-teal-500"
                    />
                </div>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-200">
                <div className="flex flex-col md:flex-row justify-between md:items-center mb-4 gap-4">
                    <h3 className="text-2xl font-bold text-gray-800">Monthly Summary</h3>
                    <div className="flex items-center gap-2">
                         <label htmlFor="summary-month" className="text-sm font-medium text-gray-700">Select Month:</label>
                        <input
                            id="summary-month"
                            type="month"
                            value={summaryMonth}
                            onChange={(e) => setSummaryMonth(e.target.value)}
                            className="border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <StatCard
                        title="Total Milk Delivered"
                        value={`${monthlySummary.totalQuantity.toFixed(2)} L`}
                        icon={<TruckIcon className="h-6 w-6 text-white"/>}
                        color="bg-indigo-500"
                    />
                    <StatCard
                        title="Revenue for Month"
                        value={`₹${monthlySummary.totalRevenue.toFixed(2)}`}
                        icon={<BillIcon className="h-6 w-6 text-white"/>}
                        color="bg-pink-500"
                    />
                    <StatCard
                        title="Customers Served"
                        value={`${monthlySummary.customersServed}`}
                        icon={<UsersIcon className="h-6 w-6 text-white"/>}
                        color="bg-orange-500"
                    />
                </div>
            </div>

             {customers.length === 0 && deliveries.length === 0 && (
                 <div className="mt-8 text-center py-12 px-6 bg-white rounded-lg shadow-md">
                    <h3 className="text-xl font-medium text-gray-700">Welcome to ssfarmorganic!</h3>
                    <p className="mt-2 text-md text-gray-500">Your dashboard is ready. Add some customers and record deliveries to see your stats here.</p>
                </div>
            )}
        </div>
    );
};

export default Dashboard;