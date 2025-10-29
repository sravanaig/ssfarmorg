

import React, { useMemo, useState } from 'react';
import type { Customer, Delivery, Payment } from '../types';
import { TruckIcon, BillIcon, CreditCardIcon, UsersIcon } from './Icons';

interface DashboardProps {
    customers: Customer[];
    deliveries: Delivery[];
    payments: Payment[];
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


const Dashboard: React.FC<DashboardProps> = ({ customers, deliveries, payments }) => {
    
    const [summaryDate, setSummaryDate] = useState(new Date().toISOString().split('T')[0]);
    const [summaryMonth, setSummaryMonth] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
    
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
        
        // Total Outstanding Balance
        const totalDue = deliveries.reduce((sum, d) => {
            const customer = customerMap.get(d.customerId);
            return sum + (d.quantity * (customer?.milkPrice || 0));
        }, 0);
        const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
        const totalOutstanding = totalDue - totalPaid;
        
        // Customer stats
        const totalCustomers = customers.length;
        const activeCustomers = customers.filter(c => c.status === 'active').length;
        const inactiveCustomers = totalCustomers - activeCustomers;

        return {
            totalQuantityToday,
            customersServedToday,
            mtdRevenue,
            totalOutstanding,
            totalCustomers,
            activeCustomers,
            inactiveCustomers,
        };
    }, [customers, deliveries, payments]);
    
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
                    title="Total Outstanding Balance"
                    value={`₹${stats.totalOutstanding.toFixed(2)}`}
                    icon={<CreditCardIcon className="h-6 w-6 text-white"/>}
                    color="bg-red-500"
                />
            </div>

            <div className="mt-8 pt-6 border-t border-gray-200">
                <h3 className="text-2xl font-bold text-gray-800 mb-4">Customer Overview</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <StatCard
                        title="Total Customers"
                        value={`${stats.totalCustomers}`}
                        icon={<UsersIcon className="h-6 w-6 text-white"/>}
                        color="bg-gray-500"
                    />
                    <StatCard
                        title="Active Customers"
                        value={`${stats.activeCustomers}`}
                        icon={<UsersIcon className="h-6 w-6 text-white"/>}
                        color="bg-teal-500"
                    />
                    <StatCard
                        title="Inactive Customers"
                        value={`${stats.inactiveCustomers}`}
                        icon={<UsersIcon className="h-6 w-6 text-white"/>}
                        color="bg-orange-500"
                    />
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
