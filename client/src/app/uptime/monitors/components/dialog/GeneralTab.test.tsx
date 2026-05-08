import { zodResolver } from "@hookform/resolvers/zod";
import { render, waitFor } from "@testing-library/react";
import { ReactNode, useEffect } from "react";
import { useForm } from "react-hook-form";
import { describe, expect, test, vi } from "vitest";
import { createMonitorSchema } from "../monitorSchemas";
import { GeneralTab } from "./GeneralTab";
import { Form } from "@/components/ui/form";

function DeferredValueForm({ children }: { children: (form: ReturnType<typeof useForm<any>>) => ReactNode }) {
  const form = useForm({
    resolver: zodResolver(createMonitorSchema),
    defaultValues: {
      organizationId: "org_1",
      name: "",
      monitorType: "http" as const,
      intervalSeconds: undefined,
      enabled: true,
      httpConfig: {
        url: "",
        method: undefined,
        followRedirects: true,
        timeoutMs: 30000,
        ipVersion: undefined,
      },
      validationRules: [],
      monitoringType: "local" as const,
      selectedRegions: ["local"],
    },
  });

  useEffect(() => {
    form.setValue("httpConfig.method", "GET");
    form.setValue("httpConfig.ipVersion", "any");
    form.setValue("intervalSeconds", 180);
  }, [form]);

  return <Form {...form}>{children(form)}</Form>;
}

function StableValueForm({ children }: { children: (form: ReturnType<typeof useForm<any>>) => ReactNode }) {
  const form = useForm({
    resolver: zodResolver(createMonitorSchema),
    defaultValues: {
      organizationId: "org_1",
      name: "",
      monitorType: "http" as const,
      intervalSeconds: 180,
      enabled: true,
      httpConfig: {
        url: "",
        method: "GET",
        followRedirects: true,
        timeoutMs: 30000,
        ipVersion: "any",
      },
      validationRules: [],
      monitoringType: "local" as const,
      selectedRegions: ["local"],
    },
  });

  return <Form {...form}>{children(form)}</Form>;
}

function renderGeneralTabWithDeferredValues() {
  return render(
    <DeferredValueForm>
      {form => <GeneralTab form={form} isEdit={false} monitorType="http" />}
    </DeferredValueForm>
  );
}

function renderGeneralTabWithStableValues() {
  return render(
    <StableValueForm>
      {form => <GeneralTab form={form} isEdit={false} monitorType="http" />}
    </StableValueForm>
  );
}

describe("GeneralTab", () => {
  test("does not warn when uptime Select values are filled after mount", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    renderGeneralTabWithDeferredValues();

    await waitFor(() => {
      expect(consoleWarnSpy.mock.calls.some(([message]) => String(message).includes("Select is changing from uncontrolled to controlled"))).toBe(false);
    });
  });

  test("does not warn when uptime Select values are defined from the first render", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    renderGeneralTabWithStableValues();

    await waitFor(() => {
      expect(consoleWarnSpy.mock.calls.some(([message]) => String(message).includes("Select is changing from uncontrolled to controlled"))).toBe(false);
    });
  });
});
