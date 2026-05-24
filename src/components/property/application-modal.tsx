"use client";

import { CustomFormField } from "@/components/FormField";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { ApplicationFormData, applicationSchema } from "@/lib/schemas";
import { useCreateApplicationMutation, useGetAuthUserQuery } from "@/state/api";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { zodResolver } from "@hookform/resolvers/zod";
import React from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

const ApplicationModal = ({
  isOpen,
  onClose,
  propertyId,
}: ApplicationModalProps) => {
  const dict = useDictionary();
  const t = dict?.property?.applicationModal;
  const [createApplication] = useCreateApplicationMutation();
  const { data: authUser } = useGetAuthUserQuery();

  const form = useForm<z.input<typeof applicationSchema>, unknown, ApplicationFormData>({
    resolver: zodResolver(applicationSchema),
    defaultValues: {
      name: "",
      email: "",
      phoneNumber: "",
      message: "",
    },
  });

  const onSubmit = async (data: ApplicationFormData) => {
    if (!authUser || authUser.userRole !== "tenant") {
      console.error(
        "You must be logged in as a tenant to submit an application"
      );
      return;
    }

    // applicationDate, status, and tenantId are set server-side in
    // `createApplication`. Client just sends the user-editable fields.
    await createApplication({
      propertyId,
      name: data.name,
      email: data.email,
      phoneNumber: data.phoneNumber,
      message: data.message,
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white">
        <DialogHeader className="mb-4">
          <DialogTitle>{t?.title ?? "Submit Application for this Property"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <CustomFormField
              name="name"
              label={t?.nameLabel ?? "Name"}
              type="text"
              placeholder={t?.namePlaceholder ?? "Enter your full name"}
            />
            <CustomFormField
              name="email"
              label={t?.emailLabel ?? "Email"}
              type="email"
              placeholder={t?.emailPlaceholder ?? "Enter your email address"}
            />
            <CustomFormField
              name="phoneNumber"
              label={t?.phoneLabel ?? "Phone Number"}
              type="text"
              placeholder={t?.phonePlaceholder ?? "Enter your phone number"}
            />
            <CustomFormField
              name="message"
              label={t?.messageLabel ?? "Message (Optional)"}
              type="textarea"
              placeholder={t?.messagePlaceholder ?? "Enter any additional information"}
            />
            <Button type="submit" className="bg-primary-700 text-white w-full">
              {t?.submit ?? "Submit Application"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default ApplicationModal;
