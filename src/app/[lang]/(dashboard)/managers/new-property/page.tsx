"use client";
// Disable static generation for this page
export const dynamic = 'force-dynamic';

import { CustomFormField } from "@/components/FormField";
import Header from "@/components/Header";
import { Form } from "@/components/ui/form";
import { PropertyFormData, propertySchema } from "@/lib/schemas";
import { useCreatePropertyMutation, useGetAuthUserQuery } from "@/state/api";
import { AmenityEnum, HighlightEnum, PropertyTypeEnum } from "@/lib/constants";
import { zodResolver } from "@hookform/resolvers/zod";
import React from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useDictionary } from "@/components/internationalization/dictionary-context";

const NewProperty = () => {
  const [createProperty] = useCreatePropertyMutation();
  const { data: authUser } = useGetAuthUserQuery();
  const pathname = usePathname();
  const dict = useDictionary();

  const form = useForm<z.input<typeof propertySchema>, unknown, PropertyFormData>({
    resolver: zodResolver(propertySchema),
    defaultValues: {
      name: "",
      description: "",
      pricePerNight: 100,
      securityDeposit: 500,
      applicationFee: 100,
      isPetsAllowed: true,
      isParkingIncluded: true,
      photoUrls: [],
      amenities: "",
      highlights: "",
      beds: 1,
      baths: 1,
      squareFeet: 1000,
      address: "",
      city: "",
      state: "",
      country: "",
      postalCode: "",
    },
  });

  const onSubmit = async (data: PropertyFormData) => {
    if (!authUser?.id) {
      throw new Error("No manager ID found");
    }

    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (key === "photoUrls") {
        const files = value as File[];
        files.forEach((file: File) => {
          formData.append("photos", file);
        });
      } else if (Array.isArray(value)) {
        formData.append(key, JSON.stringify(value));
      } else {
        formData.append(key, String(value));
      }
    });

    formData.append("managerCognitoId", authUser.id);

    await createProperty(formData);
  };

  return (
    <div className="dashboard-container">
      <Header
        title={dict.dashboard.newProperty.title}
        subtitle={dict.dashboard.newProperty.subtitle}
      />
      <div className="bg-white rounded-xl p-6">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="p-4 space-y-10"
          >
            {/* Basic Information */}
            <div>
              <h2 className="text-lg font-semibold mb-4">{dict.dashboard.newProperty.basicInformation}</h2>
              <div className="space-y-4">
                <CustomFormField name="name" label={dict.dashboard.newProperty.propertyName} />
                <CustomFormField
                  name="description"
                  label={dict.dashboard.newProperty.description}
                  type="textarea"
                />
              </div>
            </div>

            <hr className="my-6 border-gray-200" />

            {/* Fees */}
            <div className="space-y-6">
              <h2 className="text-lg font-semibold mb-4">{dict.dashboard.newProperty.fees}</h2>
              <CustomFormField
                name="pricePerNight"
                label={dict.dashboard.newProperty.pricePerNight}
                type="number"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CustomFormField
                  name="securityDeposit"
                  label={dict.dashboard.newProperty.securityDeposit}
                  type="number"
                />
                <CustomFormField
                  name="applicationFee"
                  label={dict.dashboard.newProperty.applicationFee}
                  type="number"
                />
              </div>
            </div>

            <hr className="my-6 border-gray-200" />

            {/* Property Details */}
            <div className="space-y-6">
              <h2 className="text-lg font-semibold mb-4">{dict.dashboard.newProperty.propertyDetails}</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <CustomFormField
                  name="beds"
                  label={dict.dashboard.newProperty.numberOfBeds}
                  type="number"
                />
                <CustomFormField
                  name="baths"
                  label={dict.dashboard.newProperty.numberOfBaths}
                  type="number"
                />
                <CustomFormField
                  name="squareFeet"
                  label={dict.dashboard.newProperty.squareFeet}
                  type="number"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <CustomFormField
                  name="isPetsAllowed"
                  label={dict.dashboard.newProperty.petsAllowed}
                  type="switch"
                />
                <CustomFormField
                  name="isParkingIncluded"
                  label={dict.dashboard.newProperty.parkingIncluded}
                  type="switch"
                />
              </div>
              <div className="mt-4">
                <CustomFormField
                  name="propertyType"
                  label={dict.dashboard.newProperty.propertyType}
                  type="select"
                  options={Object.keys(PropertyTypeEnum).map((type) => ({
                    value: type,
                    label: type,
                  }))}
                />
              </div>
            </div>

            <hr className="my-6 border-gray-200" />

            {/* Amenities and Highlights */}
            <div>
              <h2 className="text-lg font-semibold mb-4">
                {dict.dashboard.newProperty.amenitiesAndHighlights}
              </h2>
              <div className="space-y-6">
                <CustomFormField
                  name="amenities"
                  label={dict.dashboard.newProperty.amenities}
                  type="select"
                  options={Object.keys(AmenityEnum).map((amenity) => ({
                    value: amenity,
                    label: amenity,
                  }))}
                />
                <CustomFormField
                  name="highlights"
                  label={dict.dashboard.newProperty.highlights}
                  type="select"
                  options={Object.keys(HighlightEnum).map((highlight) => ({
                    value: highlight,
                    label: highlight,
                  }))}
                />
              </div>
            </div>

            <hr className="my-6 border-gray-200" />

            {/* Photos */}
            <div>
              <h2 className="text-lg font-semibold mb-4">{dict.dashboard.newProperty.photos}</h2>
              <CustomFormField
                name="photoUrls"
                label={dict.dashboard.newProperty.propertyPhotos}
                type="file"
                accept="image/*"
              />
            </div>

            <hr className="my-6 border-gray-200" />

            {/* Additional Information */}
            <div className="space-y-6">
              <h2 className="text-lg font-semibold mb-4">
                {dict.dashboard.newProperty.additionalInformation}
              </h2>
              <CustomFormField name="address" label={dict.dashboard.newProperty.address} />
              <div className="flex justify-between gap-4">
                <CustomFormField name="city" label={dict.dashboard.newProperty.city} className="w-full" />
                <CustomFormField
                  name="state"
                  label={dict.dashboard.newProperty.state}
                  className="w-full"
                />
                <CustomFormField
                  name="postalCode"
                  label={dict.dashboard.newProperty.postalCode}
                  className="w-full"
                />
              </div>
              <CustomFormField name="country" label={dict.dashboard.newProperty.country} />
            </div>

            <Button
              type="submit"
              className="bg-primary-700 text-white w-full mt-8"
            >
              {dict.dashboard.newProperty.createProperty}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
};

export default NewProperty;
