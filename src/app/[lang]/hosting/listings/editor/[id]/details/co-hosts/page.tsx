"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Users, Plus, X, Info, Mail } from 'lucide-react';

interface CoHost {
  id: string;
  email: string;
  name: string;
  status: 'pending' | 'accepted';
}

const CoHostsPage = () => {
  const router = useRouter();
  const [coHosts, setCoHosts] = useState<CoHost[]>([]);
  const [newEmail, setNewEmail] = useState('');

  const addCoHost = () => {
    if (newEmail && newEmail.includes('@')) {
      const name = newEmail.split('@')[0] || 'Unknown';
      setCoHosts(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          email: newEmail,
          name,
          status: 'pending' as const,
        },
      ]);
      setNewEmail('');
    }
  };

  const removeCoHost = (id: string) => {
    setCoHosts(prev => prev.filter(host => host.id !== id));
  };

  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">Add co-hosts</h1>
          <p className="text-muted-foreground">
            Invite others to help manage this listing. Co-hosts can respond to messages, update calendars, and more.
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="size-5" />
              Invite a co-host
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label htmlFor="email" className="sr-only">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter email address"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCoHost()}
                />
              </div>
              <Button onClick={addCoHost}>
                Send invite
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              They'll receive an email invitation to become a co-host.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-5" />
              Co-hosts ({coHosts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {coHosts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="size-12 mx-auto mb-3 opacity-50" />
                <p>No co-hosts yet</p>
                <p className="text-sm">Invite someone to help manage this listing</p>
              </div>
            ) : (
              <div className="space-y-4">
                {coHosts.map((host) => (
                  <div
                    key={host.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback>{host.name.charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{host.name}</p>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <Mail className="size-3" />
                          {host.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        host.status === 'accepted'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {host.status === 'accepted' ? 'Active' : 'Pending'}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeCoHost(host.id)}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-6">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Info className="size-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-900">What can co-hosts do?</h4>
                  <ul className="text-sm text-blue-700 mt-2 space-y-1">
                    <li>• Respond to messages from guests</li>
                    <li>• Update availability and pricing</li>
                    <li>• Manage reservations</li>
                    <li>• Access guest information</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 flex justify-between">
          <Button variant="outline" onClick={() => router.back()}>
            Back
          </Button>
          <Button>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CoHostsPage;
