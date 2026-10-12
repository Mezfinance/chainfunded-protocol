import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ProfileSection({ profile, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    full_name: profile.full_name || "",
    phone: profile.phone || "",
    country: profile.country || "",
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSave = () => {
    onUpdate({ ...profile, ...formData });
    setEditing(false);
  };

  const handleCancel = () => {
    setFormData({
      full_name: profile.full_name || "",
      phone: profile.phone || "",
      country: profile.country || "",
    });
    setEditing(false);
  };

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Profile Information</CardTitle>
        {!editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Full Name</label>
              <input
                type="text"
                name="full_name"
                value={formData.full_name}
                onChange={handleChange}
                className="w-full px-3 py-2 rounded-lg border border-border bg-secondary/30 text-foreground text-sm focus:outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Phone</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="e.g., +61 2 1234 5678"
                className="w-full px-3 py-2 rounded-lg border border-border bg-secondary/30 text-foreground text-sm focus:outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Country</label>
              <input
                type="text"
                name="country"
                value={formData.country}
                onChange={handleChange}
                placeholder="e.g., Australia"
                className="w-full px-3 py-2 rounded-lg border border-border bg-secondary/30 text-foreground text-sm focus:outline-none focus:border-primary/50"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={handleSave} className="bg-primary text-primary-foreground">
                Save Changes
              </Button>
              <Button size="sm" variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Full Name</p>
              <p className="text-foreground">{profile.full_name || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Phone</p>
              <p className="text-foreground">{profile.phone || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Country</p>
              <p className="text-foreground">{profile.country || "—"}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
