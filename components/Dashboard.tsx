
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
        const currentMonth = today.substring(0, 7);

        const deliveriesToday = deliveries.filter(d => d.date === today);
        const deliveriesThisMonth = deliveries.filter(d => d.date.startsWith(currentMonth));
        const paymentsThisMonth = payments.filter(p => p.date.startsWith(currentMonth));
        
        const totalQuantityToday = deliveriesToday.reduce((sum, d) => sum + d.quantity, 0);
        const totalRevenueToday = deliveriesToday.reduce((sum, d) => {
            const customer = customers.find(c => c.id === d.customerId);
            return sum + (d.quantity * (customer?.milkPrice || 0));
        }, 0);
        
        const totalRevenueThisMonth = deliveriesThisMonth.reduce((sum, d) => {
            const customer = customers.find(c => c.id === d.customerId);
            return sum + (d.quantity * (customer?.milkPrice || 0));
        }, 0);

        const totalPaidThisMonth = paymentsThisMonth.reduce((sum, p) => sum + p.amount, 0);

        return {
            totalQuantityToday,
            totalRevenueToday,
            totalRevenueThisMonth,
            totalPaidThisMonth,
            activeCustomers: customers.filter(c => c.status === 'active').length,
            pendingApprovals: pendingDeliveries.length,
        };
    }, [customers, deliveries, payments, pendingDeliveries]);

    const dailySummary = useMemo(() => {
        const deliveriesForDate = deliveries.filter(d => d.date === summaryDate);
        const ordersForDate = orders.filter(o => o.date === summaryDate);
        
        const totalQuantity = deliveriesForDate.reduce((sum, d) => sum + d.quantity, 0);
        const totalRevenue = deliveriesForDate.reduce((sum, d) => {
            const customer = customers.find(c => c.id === d.customerId);
            return sum + (d.quantity * (customer?.milkPrice || 0));
        }, 0);

        return {
            date: summaryDate,
            totalQuantity,
            totalRevenue,
            totalDeliveries: deliveriesForDate.length,
            totalOrders: ordersForDate.length,
        }
    }, [summaryDate, deliveries, orders, customers]);
    
    useEffect(() => {
        const createBarChart = () => {
            if (!barChartRef.current) return;
            const barCtx = barChartRef.current.getContext('2d');
            if (!barCtx) return;

            const [year, month] = summaryMonth.split('-').map(Number);
            const daysInMonth = new Date(year, month, 0).getDate();
            const labels = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`);
            
            const deliveriesData = new Array(daysInMonth).fill(0);
            const revenueData = new Array(daysInMonth).fill(0);
            
            deliveries.forEach(d => {
                if(d.date.startsWith(summaryMonth)) {
                    const dayIndex = new Date(d.date + 'T00:00:00Z').getUTCDate() - 1;
                    const customer = customers.find(c => c.id === d.customerId);
                    deliveriesData[dayIndex] += d.quantity;
                    revenueData[dayIndex] += d.quantity * (customer?.milkPrice || 0);
                }
            });

            if (barChartInstance.current) {
                barChartInstance.current.destroy();
            }

            barChartInstance.current = new Chart(barCtx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Total Revenue (₹)',
                            data: revenueData,
                            backgroundColor: 'rgba(54, 162, 235, 0.6)',
                            borderColor: 'rgba(54, 162, 235, 1)',
                            borderWidth: 1,
                            yAxisID: 'yRevenue',
                        },
                        {
                            label: 'Total Quantity (L)',
                            data: deliveriesData,
                            backgroundColor: 'rgba(75, 192, 192, 0.6)',
                            borderColor: 'rgba(75, 192, 192, 1)',
                            borderWidth: 1,
                            yAxisID: 'yQuantity',
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        yRevenue: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: { display: true, text: 'Revenue (₹)' }
                        },
                        yQuantity: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            title: { display: true, text: 'Quantity (L)' },
                            grid: { drawOnChartArea: false }
                        }
                    },
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: function(context: any) {
                                    let label = context.dataset.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed.y !== null) {
                                        if(context.dataset.yAxisID === 'yRevenue') {
                                            label += new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(context.parsed.y);
                                        } else {
                                            label += `${context.parsed.y.toFixed(2)} L`;
                                        }
                                    }
                                    return label;
                                }
                            }
                        },
                        legend: { position: 'top' },
                        title: { display: true, text: `Monthly Summary for ${new Date(summaryMonth + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}` }
                    },
                },
            });
        };
        
        const createPieChart = () => {
            if (!pieChartRef.current) return;
            const pieCtx = pieChartRef.current.getContext('2d');
            if (!pieCtx) return;

            const deliveriesThisMonth = deliveries.filter(d => d.date.startsWith(summaryMonth));
            const quantityPerCustomer = new Map<string, number>();

            deliveriesThisMonth.forEach(d => {
                const customerName = customers.find(c => c.id === d.customerId)?.name || 'Unknown';
                quantityPerCustomer.set(customerName, (quantityPerCustomer.get(customerName) || 0) + d.quantity);
            });

            const sortedCustomers = Array.from(quantityPerCustomer.entries()).sort((a,b) => b[1] - a[1]).slice(0, 10);
            
            const chartData = {
                labels: sortedCustomers.map(c => c[0]),
                data: sortedCustomers.map(c => c[1])
            };

            if (pieChartInstance.current) {
                pieChartInstance.current.destroy();
            }

            pieChartInstance.current = new Chart(pieCtx, {
                type: 'pie',
                data: {
                    labels: chartData.labels,
                    datasets: [{
                        label: 'Total Quantity',
                        data: chartData.data,
                        backgroundColor: [
                            'rgba(255, 99, 132, 0.7)', 'rgba(54, 162, 235, 0.7)',
                            'rgba(255, 206, 86, 0.7)', 'rgba(75, 192, 192, 0.7)',
                            'rgba(153, 102, 255, 0.7)', 'rgba(255, 159, 64, 0.7)',
                            'rgba(255, 99, 132, 0.5)', 'rgba(54, 162, 235, 0.5)',
                            'rgba(255, 206, 86, 0.5)', 'rgba(75, 192, 192, 0.5)'
                        ],
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: function(c: any) {
                                    const label = c.label || '';
                                    const rawValue = c.raw;
                                    if (typeof rawValue === 'number') {
                                        return `${label}: ${rawValue.toFixed(2)} L`;
                                    }
                                    return label;
                                }
                            }
                        },
                        legend: { position: 'right' },
                        title: { display: true, text: 'Top 10 Customers by Quantity (This Month)' }
                    }
                }
            });
        }
        
        createBarChart();
        createPieChart();

        return () => {
            if (barChartInstance.current) {
                barChartInstance.current.destroy();
            }
            if (pieChartInstance.current) {
                pieChartInstance.current.destroy();
            }
        };

    }, [summaryMonth, deliveries, payments, customers]);

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-3xl font-bold text-gray-800">Dashboard</h2>
                <p className="text-gray-500">Overview of your business performance.</p>
            </div>

            {/* General Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                 <StatCard 
                    title="Active Customers"
                    value={stats.activeCustomers.toString()}
                    icon={<UsersIcon className="h-6 w-6 text-blue-600"/>}
                    color="bg-blue-100"
                />
                 <StatCard 
                    title="Pending Approvals"
                    value={stats.pendingApprovals.toString()}
                    subtitle="Deliveries need review"
                    icon={<CheckIcon className="h-6 w-6 text-yellow-600"/>}
                    color="bg-yellow-100"
                />
                <StatCard 
                    title="Today's Revenue"
                    value={`₹${stats.totalRevenueToday.toFixed(2)}`}
                    subtitle={`${stats.totalQuantityToday.toFixed(2)} L delivered`}
                    icon={<BillIcon className="h-6 w-6 text-green-600"/>}
                    color="bg-green-100"
                />
                 <StatCard 
                    title="Revenue (This Month)"
                    value={`₹${stats.totalRevenueThisMonth.toFixed(2)}`}
                    icon={<BillIcon className="h-6 w-6 text-purple-600"/>}
                    color="bg-purple-100"
                />
                <StatCard 
                    title="Payments (This Month)"
                    value={`₹${stats.totalPaidThisMonth.toFixed(2)}`}
                    icon={<CreditCardIcon className="h-6 w-6 text-indigo-600"/>}
                    color="bg-indigo-100"
                />
            </div>

            {/* Daily Summary */}
            <div className="bg-white p-6 rounded-lg shadow-md">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold text-gray-800">Daily Summary</h3>
                    <input type="date" value={summaryDate} onChange={e => setSummaryDate(e.target.value)} className="border border-gray-300 rounded-md shadow-sm p-2" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div><p className="text-sm text-gray-500">Total Deliveries</p><p className="text-2xl font-bold">{dailySummary.totalDeliveries}</p></div>
                    <div><p className="text-sm text-gray-500">Total Orders</p><p className="text-2xl font-bold">{dailySummary.totalOrders}</p></div>
                    <div><p className="text-sm text-gray-500">Total Quantity</p><p className="text-2xl font-bold">{dailySummary.totalQuantity.toFixed(2)} L</p></div>
                    <div><p className="text-sm text-gray-500">Total Revenue</p><p className="text-2xl font-bold text-green-600">₹{dailySummary.totalRevenue.toFixed(2)}</p></div>
                </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
                <div className="xl:col-span-3 bg-white p-6 rounded-lg shadow-md">
                    <div className="flex justify-between items-center mb-4">
                         <h3 className="text-xl font-semibold text-gray-800">Monthly Performance</h3>
                        <input type="month" value={summaryMonth} onChange={e => setSummaryMonth(e.target.value)} className="border border-gray-300 rounded-md shadow-sm p-2" />
                    </div>
                    <div className="h-96">
                        <canvas ref={barChartRef}></canvas>
                    </div>
                </div>
                <div className="xl:col-span-2 bg-white p-6 rounded-lg shadow-md">
                     <h3 className="text-xl font-semibold text-gray-800 mb-4">Top Customers</h3>
                     <div className="h-96">
                        <canvas ref={pieChartRef}></canvas>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
