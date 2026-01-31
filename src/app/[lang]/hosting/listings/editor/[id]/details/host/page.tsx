"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, Camera, Info } from 'lucide-react';

const HostPage = () => {
  const router = useRouter();
  const [hostInfo, setHostInfo] = useState({
    displayName: '',
    bio: '',
    responseTime: '',
    languages: '',
    work: '',
    location: '',
  });

  const handleChange = (field: string, value: string) => {
    setHostInfo(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">Tell guests about yourself</h1>
          <p className="text-muted-foreground">
            Share a bit about who you are to help guests feel comfortable booking your place.
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="size-5" />
              Profile photo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <Avatar className="size-24">
                <AvatarImage src="" />
                <AvatarFallback className="text-2xl">H</AvatarFallback>
              </Avatar>
              <div>
                <Button variant="outline" className="gap-2">
                  <Camera className="size-4" />
                  Upload photo
                </Button>
                <p className="text-sm text-muted-foreground mt-2">
                  A clear photo helps guests recognize you
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>About you</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                placeholder="How you'd like to be called"
                className="mt-2"
                value={hostInfo.displayName}
                onChange={(e) => handleChange('displayName', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                placeholder="Tell guests a bit about yourself, your background, and what you love about hosting..."
                className="mt-2 min-h-[120px]"
                value={hostInfo.bio}
                onChange={(e) => handleChange('bio', e.target.value)}
                maxLength={500}
              />
              <p className="text-sm text-muted-foreground mt-2">{hostInfo.bio.length}/500</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="work">Work</Label>
                <Input
                  id="work"
                  placeholder="What do you do?"
                  className="mt-2"
                  value={hostInfo.work}
                  onChange={(e) => handleChange('work', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="location">Where you live</Label>
                <Input
                  id="location"
                  placeholder="City, Country"
                  className="mt-2"
                  value={hostInfo.location}
                  onChange={(e) => handleChange('location', e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="languages">Languages you speak</Label>
              <Input
                id="languages"
                placeholder="English, Arabic, French..."
                className="mt-2"
                value={hostInfo.languages}
                onChange={(e) => handleChange('languages', e.target.value)}
              />
            </div>

            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-start gap-3">
                <Info className="size-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-900">Profile tip</h4>
                  <p className="text-sm text-blue-700 mt-1">
                    Guests are more likely to book with hosts who have complete profiles. Share what makes you a great host and why you love your area.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

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

export default HostPage;
