import { createSerializer } from "nuqs/server";
import { describe, expect, it } from "vitest";

import type { ResultsScope } from "./filters";
import { loadResultsParams, resultsApiPath, resultsParamsFor, resultsParsers, toResultsQuery } from "./search-params";

const bags: ResultsScope = { kind: "category", categorySlug: "bags" };
const women: ResultsScope = { kind: "audience", audience: "women" };
const newIn: ResultsScope = { kind: "new", limit: 24 };
const search = (q: string): ResultsScope => ({ kind: "search", q });

describe("toResultsQuery", () => {
  it("drops unknown values, sorts lists, clamps the page and falls back to the scope's sort", () => {
    const params = loadResultsParams("?colour=red&colour=nope&colour=black&price=under-500&page=0&sort=relevance&stock=in");
    expect(toResultsQuery(params, bags)).toMatchObject({
      filters: { colour: ["black", "red"], price: ["under-500"], stock: true },
      page: 1,
      sort: "newest",
    });
  });

  it("drops filters the page hides", () => {
    expect(toResultsQuery(loadResultsParams("?audience=women"), women).filters.audience).toEqual([]);
    expect(toResultsQuery(loadResultsParams("?new=1&category=bags"), newIn).filters).toMatchObject({ newIn: false, category: [] });
  });

  it("reads every key on search", () => {
    const params = loadResultsParams(
      "?q=tote&sort=price-desc&category=bags&audience=men&material=wool&price=2000-plus&stock=in&new=1&page=3",
    );
    expect(toResultsQuery(params, search("tote"))).toEqual({
      scope: { kind: "search", q: "tote" },
      filters: {
        category: ["bags"],
        audience: ["men"],
        colour: [],
        material: ["wool"],
        price: ["2000-plus"],
        stock: true,
        newIn: true,
      },
      sort: "price-desc",
      page: 3,
    });
  });

  it("treats invalid switches, pages and sorts as absent", () => {
    const params = loadResultsParams("?stock=yes&new=true&page=abc&page=-3&sort=cheapest");
    expect(toResultsQuery(params, bags)).toMatchObject({ filters: { stock: false, newIn: false }, page: 1, sort: "newest" });
  });

  it("keeps a tab only where the page has tabs", () => {
    expect(toResultsQuery(loadResultsParams(""), women, "bags").tab).toBe("bags");
    expect(toResultsQuery(loadResultsParams(""), bags, "shoes").tab).toBeUndefined();
  });
});

describe("resultsApiPath", () => {
  const path = (search: string, scope: ResultsScope, tab?: string) =>
    resultsApiPath(toResultsQuery(loadResultsParams(search), scope, tab));

  it("puts keys in a fixed order and leaves defaults out", () => {
    expect(path("?material=wool&colour=red", bags)).toBe("/api/products?collection=bags&colour=red&material=wool");
    expect(path("?sort=newest&page=1", bags)).toBe("/api/products?collection=bags");
  });

  it("takes the collection from the scope and the tab from the query", () => {
    expect(path("?page=2&sort=price-asc", women, "bags")).toBe("/api/products?collection=women&tab=bags&sort=price-asc&page=2");
    expect(path("?stock=in", newIn)).toBe("/api/products?collection=new&stock=in");
  });

  it("repeats a key per value and encodes search text", () => {
    expect(path("?q=gold%20%26%20silver&colour=silver&colour=gold&new=1", search("gold & silver"))).toBe(
      "/api/products?q=gold+silver&colour=gold&colour=silver&new=1",
    );
    expect(path("?sort=relevance", search("tote"))).toBe("/api/products?q=tote");
  });

  it("asks for one page on its own with slice=1", () => {
    const query = toResultsQuery(loadResultsParams("?page=3&colour=red"), bags);
    expect(resultsApiPath(query, { slice: true })).toBe("/api/products?collection=bags&colour=red&page=3&slice=1");
  });

  it("is the same for equal queries written differently", () => {
    expect(path("?colour=red&colour=black&colour=red", bags)).toBe(path("?colour=black&colour=red", bags));
  });
});

describe("resultsParamsFor", () => {
  const serialize = createSerializer(resultsParsers);

  it("round-trips a query through the URL", () => {
    const query = toResultsQuery(
      loadResultsParams("?colour=red&colour=black&material=wool&price=under-500&stock=in&sort=price-asc&page=2"),
      women,
      "bags",
    );
    const url = serialize(resultsParamsFor(query));
    expect(url).toBe("?sort=price-asc&colour=black&colour=red&material=wool&price=under-500&stock=in&page=2");
    expect(toResultsQuery(loadResultsParams(url), women, "bags")).toEqual(query);
  });

  it("clears defaults and empty filters", () => {
    expect(serialize(resultsParamsFor(toResultsQuery(loadResultsParams("?sort=newest&page=1"), bags)))).toBe("");
  });

  it("leaves q to the page", () => {
    expect(resultsParamsFor(toResultsQuery(loadResultsParams("?q=tote"), search("tote")))).not.toHaveProperty("q");
  });
});
