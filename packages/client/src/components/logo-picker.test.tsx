import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { IMAGE_UPLOAD_ACCEPT } from "@/lib/upload-constraints";
import { LogoPicker } from "./logo-picker";

type ApiFetchMock = (
  url: string,
  responseSchema: unknown,
  init?: { signal?: AbortSignal },
) => Promise<unknown>;

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn<ApiFetchMock>(),
}));

vi.mock("@/lib/api-client", () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }

  return {
    ApiError,
    apiFetch: mocks.apiFetch,
  };
});

vi.mock("@/hooks/use-cropped-image-upload", () => ({
  useCroppedImageUpload: (options: { onChange: (value: string | undefined) => void }) => ({
    fileInputRef: { current: null },
    cropDialogOpen: false,
    setCropDialogOpen: vi.fn(),
    uploadedImage: "",
    uploadStatus: "idle",
    previewUrl: undefined,
    handleFileUpload: vi.fn(),
    handleCropComplete: vi.fn(),
    applyValue: (value: string | undefined) => options.onChange(value),
  }),
}));

vi.mock("@/components/image-crop-dialog", () => ({
  ImageCropDialog: () => null,
}));

function expectApiFetchCallWithSignal(urlPart: string) {
  const call = mocks.apiFetch.mock.calls.find(([url]) => url.includes(urlPart));
  expect(call?.[0]).toContain(urlPart);
  expect(call?.[2]?.signal).toBeInstanceOf(AbortSignal);
}

/**
 * LogoPicker now embeds <LogoFromUrlButton>, which uses React Query's useMutation.
 * Provide a fresh client per test so retries/cache don't leak between cases.
 */
function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("LogoPicker", () => {
  beforeEach(() => {
    mocks.apiFetch.mockReset();
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    mocks.apiFetch.mockImplementation((url: string) => {
      if (url.startsWith("/api/app/thesvg-icons")) {
        return Promise.resolve({
          icons: [
            {
              slug: "netflix",
              title: "Netflix",
              iconUrl: "https://testingcf.jsdelivr.net/gh/glincker/thesvg@main/public/icons/netflix/default.svg",
              aliases: [],
              categories: ["Entertainment"],
            },
          ],
        });
      }

      return Promise.resolve({ imageUrls: [], kind: "logo" });
    });
  });

  it("searches and selects a built-in theSVG logo from the unified Logo search", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithClient(<LogoPicker value={undefined} onChange={onChange} serviceName="Netflix" />);

    await user.click(screen.getByRole("button", { name: "搜索 Logo" }));

    await waitFor(() => {
      expectApiFetchCallWithSignal("/api/app/thesvg-icons?search=Netflix");
    });

    expect(await screen.findByText("内置图标：")).toBeInTheDocument();
    await user.click(await screen.findByTitle("Netflix"));

    expect(onChange).toHaveBeenCalledWith(
      "https://testingcf.jsdelivr.net/gh/glincker/thesvg@main/public/icons/netflix/default.svg",
    );
  });

  it("allows SVG files in the custom Logo file picker", () => {
    const { container } = renderWithClient(<LogoPicker value={undefined} onChange={vi.fn()} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');

    expect(input).toHaveAttribute("accept", IMAGE_UPLOAD_ACCEPT);
  });

  it("shows a clear built-in icon empty state while keeping favicon fallback results", async () => {
    const user = userEvent.setup();
    mocks.apiFetch.mockImplementation((url: string) => {
      if (url.startsWith("/api/app/thesvg-icons")) {
        return Promise.resolve({ icons: [] });
      }

      return Promise.resolve({ imageUrls: [], kind: "logo" });
    });

    renderWithClient(<LogoPicker value={undefined} onChange={vi.fn()} serviceName="DMIT" />);

    await user.click(screen.getByRole("button", { name: "搜索 Logo" }));

    expect(await screen.findByText("内置图标：")).toBeInTheDocument();
    expect(await screen.findByText("内置图标未命中")).toBeInTheDocument();
    expect(screen.getByText("网站/Favicon 备用：")).toBeInTheDocument();
  });

  it("shows a built-in icon failure state when the theSVG endpoint fails", async () => {
    const user = userEvent.setup();
    mocks.apiFetch.mockImplementation((url: string) => {
      if (url.startsWith("/api/app/thesvg-icons")) {
        return Promise.reject(new Error("theSVG offline"));
      }

      return Promise.resolve({ imageUrls: [], kind: "logo" });
    });

    renderWithClient(<LogoPicker value={undefined} onChange={vi.fn()} serviceName="DMIT" />);

    await user.click(screen.getByRole("button", { name: "搜索 Logo" }));

    expect(await screen.findByText("内置图标：")).toBeInTheDocument();
    expect(await screen.findByText("内置图标搜索失败")).toBeInTheDocument();
    expect(screen.getByText("网站/Favicon 备用：")).toBeInTheDocument();
  });

  it("keeps the search box empty after clearing the auto-filled service name", async () => {
    const user = userEvent.setup();

    renderWithClient(<LogoPicker value={undefined} onChange={vi.fn()} serviceName="youtube" />);

    await user.click(screen.getByRole("button", { name: "搜索 Logo" }));
    const searchInput = screen.getByPlaceholderText("输入服务名称或品牌...");

    await waitFor(() => {
      expect(searchInput).toHaveValue("youtube");
    });
    expectApiFetchCallWithSignal("/api/app/thesvg-icons?search=youtube");

    await user.clear(searchInput);

    expect(searchInput).toHaveValue("");
  });
});
