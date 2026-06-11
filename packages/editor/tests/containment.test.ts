import { describe, it, expect } from "vitest";
import {
  headingDepthOf,
  inferBlockContainment,
  inferContainmentFromMarkdown,
} from "../src/markdown/containment";

describe("headingDepthOf", () => {
  it("recognizes ATX headings 1–6", () => {
    expect(headingDepthOf("# A")).toBe(1);
    expect(headingDepthOf("### C")).toBe(3);
    expect(headingDepthOf("###### F")).toBe(6);
  });
  it("ignores non-headings and hashtags", () => {
    expect(headingDepthOf("plain text")).toBeNull();
    expect(headingDepthOf("#hashtag")).toBeNull();
    expect(headingDepthOf("#")).toBeNull();
    expect(headingDepthOf("####### too deep")).toBeNull();
  });
  it("recognizes id-stamped and indented headings", () => {
    expect(headingDepthOf("## B <!-- hiermark:block=blk_x -->")).toBe(2);
    expect(headingDepthOf("   # A")).toBe(1);
  });
});

describe("inferBlockContainment", () => {
  const depths = (ds: (number | null)[]) =>
    inferBlockContainment(ds.map((headingDepth) => ({ headingDepth })));

  it("nests body blocks under the open heading and pops siblings", () => {
    // # A / para / ## B / para / # C / para
    expect(depths([1, null, 2, null, 1, null])).toEqual([null, 0, 0, 2, null, 4]);
  });
  it("attaches blocks before the first heading to root", () => {
    expect(depths([null, null, 1, null])).toEqual([null, null, null, 2]);
  });
  it("pops equal-and-deeper headings (>=) on a shallower sibling", () => {
    // # A / ## B / ### C / ## D  → D pops C and B, lands under A
    expect(depths([1, 2, 3, 2])).toEqual([null, 0, 1, 0]);
  });
  it("handles a heading-level jump with no intermediate", () => {
    // h1 -> h3 nests h3 directly under h1
    expect(depths([1, 3])).toEqual([null, 0]);
  });
});

describe("inferContainmentFromMarkdown", () => {
  it("derives containment from markdown bodies", () => {
    expect(inferContainmentFromMarkdown(["# A", "body", "## B", "body"])).toEqual([null, 0, 0, 2]);
  });
});
