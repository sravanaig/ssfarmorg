import React, { useState } from 'react';
import type { ManagedUser } from '../types';
import { supabase } from '../lib/supabaseClient';
import { TrashIcon, PlusIcon, SpinnerIcon } from './Icons';
import Modal from './Modal';
import { getFriendlyErrorMessage } from '../lib/errorHandler';

interface UserManagerProps {
  users: ManagedUser[];
  setUsers: React.Dispatch<React.SetStateAction<ManagedUser[]>>;
}

const UserForm: React.FC<{
    onSubmit: (user: Omit<ManagedUser, 'id' | 'created_at' | 'status'> & { password?: string }) => Promise<void>;
    onClose: () => void;
    isCreating: boolean;
}> = ({ onSubmit, onClose, isCreating }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<'admin' | 'staff'>('staff');
    const [errors, setErrors] = useState<{ [key: string]: string }>({});

    const validate = () => {
        const newErrors: { [key: string]: string } = {};
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) newErrors.email = "Please enter a valid email address.";
        if (password.length < 6) newErrors.password = "Password must be at least 6 characters long.";
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (validate()) {
            await onSubmit({ email, password, role });
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className={`mt-1 block w-full border ${errors.email ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`} />
                {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className={`mt-1 block w-full border ${errors.password ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`} />
                {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">Role</label>
                <select value={role} onChange={e => setRole(e.target.value as 'admin' | 'staff')} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                </select>
            </div>
            <div className="flex justify-end pt-4 space-x-2">
                <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancel</button>
                <button type="submit" disabled={isCreating} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                    {isCreating ? 'Creating...' : 'Create User'}
                </button>
            </div>
        </form>
    );
};

const UserManager: React.FC<UserManagerProps> = ({ users, setUsers }) => {
    const [isUpdating, setIsUpdating] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);

    const handleRoleChange = async (userId: string, newRole: 'admin' | 'staff') => {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser?.id === userId && newRole === 'staff') {
            alert("For security, you cannot change your own role from 'admin' to 'staff'. Another admin must perform this action.");
            return;
        }

        setIsUpdating(userId);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ role: newRole })
                .eq('id', userId);
            
            if (error) throw error;

            setUsers(prevUsers => 
                prevUsers.map(user => 
                    user.id === userId ? { ...user, role: newRole } : user
                )
            );
            alert(`User role updated successfully.`);
        } catch (error: any) {
            alert(`Error updating role: ${getFriendlyErrorMessage(error)}`);
        } finally {
            setIsUpdating(null);
        }
    };

    const handleUpdateStatus = async (userId: string, userEmail: string, newStatus: 'approved' | 'rejected') => {
        const action = newStatus === 'approved' ? 'approve' : 'reject';
        if (!window.confirm(`Are you sure you want to ${action} the user "${userEmail}"?`)) return;
    
        setIsUpdating(userId);
        try {
            const { error } = await supabase.rpc('update_user_status', {
                target_user_id: userId,
                new_status: newStatus
            });
            if (error) throw error;
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: newStatus } : u));
            alert(`User has been ${action}d.`);
        } catch (error: any) {
            alert(`Error updating status: ${getFriendlyErrorMessage(error)}`);
        } finally {
            setIsUpdating(null);
        }
    };
    
    const handleCreateUser = async (userData: Omit<ManagedUser, 'id' | 'created_at' | 'status'> & { password?: string }) => {
        setIsCreating(true);
        try {
            const { data, error } = await supabase.rpc('create_new_user', {
                p_email: userData.email,
                p_password: userData.password,
                p_role: userData.role
            });

            if (error) throw error;
            
            if (data && Array.isArray(data) && data.length > 0) {
                 const newUser: ManagedUser = data[0];
                 setUsers(prev => [...prev, newUser].sort((a,b) => (a.email || '').localeCompare(b.email || '')));
                 alert(`User "${newUser.email}" created successfully.`);
                 setIsModalOpen(false);
            } else {
                throw new Error("User creation did not return the expected data.");
            }

        } catch (error: any) {
            alert(`Error creating user: ${getFriendlyErrorMessage(error)}`);
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteUser = async (userId: string, userEmail: string) => {
        if (window.confirm(`Are you sure you want to permanently delete the user "${userEmail}"? This action cannot be undone.`)) {
            setIsUpdating(userId);
            try {
                const { error } = await supabase.rpc('delete_user_by_id', { target_user_id: userId });

                if (error) throw error;
                
                setUsers(prevUsers => prevUsers.filter(user => user.id !== userId));
                alert(`User "${userEmail}" deleted successfully.`);
            } catch (error: any)
            {
                alert(`Error deleting user: ${getFriendlyErrorMessage(error)}`);
                console.error('Deletion error:', error);
            } finally {
                setIsUpdating(null);
            }
        }
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-gray-800">User Logins</h2>
                <button onClick={() => setIsModalOpen(true)} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors">
                    <PlusIcon className="h-5 w-5 mr-2"/>
                    Create User
                </button>
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Create New User">
                <UserForm
                    onSubmit={handleCreateUser}
                    onClose={() => setIsModalOpen(false)}
                    isCreating={isCreating}
                />
            </Modal>

            <div className="bg-white shadow-md rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    {users.length > 0 ? (
                        <table className="w-full text-sm text-left text-gray-500">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                <tr>
                                    <th scope="col" className="px-6 py-3">Email</th>
                                    <th scope="col" className="px-6 py-3">Role</th>
                                    <th scope="col" className="px-6 py-3">Status</th>
                                    <th scope="col" className="px-6 py-3">Joined On</th>
                                    <th scope="col" className="px-6 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(user => (
                                    <tr key={user.id} className="bg-white border-b hover:bg-gray-50">
                                        <td className="px-6 py-4 font-medium text-gray-900">{user.email}</td>
                                        <td className="px-6 py-4">
                                            {user.status === 'approved' ? (
                                                <select
                                                    value={user.role}
                                                    onChange={(e) => handleRoleChange(user.id, e.target.value as 'admin' | 'staff')}
                                                    disabled={isUpdating === user.id}
                                                    className="border border-gray-300 rounded-md shadow-sm py-1 px-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                                                >
                                                    <option value="admin">Admin</option>
                                                    <option value="staff">Staff</option>
                                                </select>
                                            ) : (
                                                <span className="capitalize text-gray-600">{user.role}</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full capitalize ${
                                                user.status === 'approved' ? 'bg-green-100 text-green-800' :
                                                user.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                                'bg-red-100 text-red-800'
                                            }`}>
                                                {user.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {new Date(user.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                        {isUpdating === user.id ? (
                                            <div className="flex justify-end">
                                                <SpinnerIcon className="h-5 w-5 animate-spin text-gray-500" />
                                            </div>
                                        ) : user.status === 'pending' ? (
                                            <div className="flex gap-2 justify-end">
                                                <button onClick={() => handleUpdateStatus(user.id, user.email, 'approved')} title="Approve User" className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700">Approve</button>
                                                <button onClick={() => handleUpdateStatus(user.id, user.email, 'rejected')} title="Reject User" className="px-2 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-700">Reject</button>
                                            </div>
                                        ) : (
                                            <button 
                                                onClick={() => handleDeleteUser(user.id, user.email)}
                                                className="text-red-600 hover:text-red-800"
                                                title="Delete User"
                                            >
                                                <TrashIcon className="w-5 h-5"/>
                                            </button>
                                        )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="text-center py-12 px-6">
                            <h3 className="text-lg font-medium text-gray-700">No Users Found</h3>
                            <p className="mt-1 text-sm text-gray-500">Only the initial admin user exists.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default UserManager;