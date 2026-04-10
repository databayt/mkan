import { SettingsFormData, settingsSchema } from "@/lib/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { Form } from "./ui/form";
import { CustomFormField } from "./FormField";
import { Button } from "./ui/button";
import { useDictionary } from "@/components/internationalization/dictionary-context";

const SettingsForm = ({
  initialData,
  onSubmit,
  userType,
}: SettingsFormProps) => {
  const dict = useDictionary();
  const [editMode, setEditMode] = useState(false);
  const form = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: initialData,
  });

  const toggleEditMode = () => {
    setEditMode(!editMode);
    if (editMode) {
      form.reset(initialData);
    }
  };

  const handleSubmit = async (data: SettingsFormData) => {
    await onSubmit(data);
    setEditMode(false);
  };

  return (
    <div className="pt-8 pb-5 px-8">
      <div className="mb-5">
        <h1 className="text-xl font-semibold">
          {userType === "manager"
            ? (dict.dashboard?.settingsForm?.managerSettings ?? "Manager Settings")
            : userType === "tenant"
            ? (dict.dashboard?.settingsForm?.tenantSettings ?? "Tenant Settings")
            : (dict.dashboard?.settingsForm?.managerSettings ?? "Settings")}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {dict.dashboard?.settingsForm?.settingsSubtitle ?? "Manage your account preferences and personal information"}
        </p>
      </div>
      <div className="bg-white rounded-xl p-6">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-6"
          >
            <CustomFormField name="name" label={dict.dashboard?.settingsForm?.name ?? "Name"} disabled={!editMode} />
            <CustomFormField
              name="email"
              label={dict.dashboard?.settingsForm?.email ?? "Email"}
              type="email"
              disabled={!editMode}
            />
            <CustomFormField
              name="phoneNumber"
              label={dict.dashboard?.settingsForm?.phoneNumber ?? "Phone Number"}
              disabled={!editMode}
            />

            <div className="pt-4 flex justify-between">
              <Button
                type="button"
                onClick={toggleEditMode}
                className="bg-secondary-500 text-white hover:bg-secondary-600"
              >
                {editMode ? (dict.common?.cancel ?? "Cancel") : (dict.common?.edit ?? "Edit")}
              </Button>
              {editMode && (
                <Button
                  type="submit"
                  className="bg-primary-700 text-white hover:bg-primary-800"
                >
                  {dict.dashboard?.common?.saveChanges ?? "Save Changes"}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
};

export default SettingsForm;
