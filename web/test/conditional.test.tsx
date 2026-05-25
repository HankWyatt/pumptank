import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { MintLink } from "@/components/MintLink";
import { EpisodeEmbed } from "@/components/EpisodeEmbed";

test("MintLink links to pump.fun when mint present", () => {
  render(<MintLink mint="MINT123" />);
  expect(screen.getByRole("link")).toHaveAttribute("href", "https://pump.fun/MINT123");
});

test("MintLink shows 'launching soon' when mint absent", () => {
  render(<MintLink mint={null} />);
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.getByText(/launching soon/i)).toBeInTheDocument();
});

test("EpisodeEmbed renders an iframe when url present", () => {
  const { container } = render(<EpisodeEmbed url="https://youtube.com/embed/xyz" />);
  expect(container.querySelector("iframe")).not.toBeNull();
});

test("EpisodeEmbed renders nothing when url absent", () => {
  const { container } = render(<EpisodeEmbed url={null} />);
  expect(container.firstChild).toBeNull();
});
