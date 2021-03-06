import Ajv from "ajv";

import { TILE_SOURCE_TEMPLATE, STAC_PROXY_URL, TILE_PROXY_URL } from './config';

export const getProxiedUri = (uri) => {
  // If we are proxying a STAC Catalog, replace any URI with the proxied address.
  // STAC_PROXY_URL has the form https://thingtoproxy.com|http://proxy:111
  return !!STAC_PROXY_URL ? (
    uri.replace(STAC_PROXY_URL.split('|')[0], STAC_PROXY_URL.split('|')[1])
  ) : uri;
}

export async function fetchUri(uri) {
  const proxiedUri = getProxiedUri(uri);
  return fetch(proxiedUri);
};

const modifyLoadSchemaUri = function (baseUrl, uri) {
  if (uri.includes("://")) { return uri; } // Absolute URI

  if (uri.includes("/")) {
    // Relative path, e.g. collection to catalog.
    return `${baseUrl}/${uri}`;
  }

  // Common Metadata
  return `${baseUrl}/item-spec/json-schema/${uri}`;
};

const fixUpSchema = function (schema, schemaUri) {
  // Make $id unique, otherwise AjV will complain
  // Taken from https://github.com/m-mohr/stac-node-validator/blob/master/index.js#L118 (79d3461)
  schema.$id = schemaUri + '#';

  // Fix old schemas that have 'id' instead of '$id'
  if ("id" in schema) {
    delete schema.id;
  }

  return schema;
};

export async function fetchSchemaValidator(stacObjectType, stacVersion) {

  // 1.0.0-beta.1 schemas have some issues that are fixed in dev.
  let baseUrl = stacVersion === '1.0.0-beta.1' ? (
    `https://raw.githubusercontent.com/radiantearth/stac-spec/dev`
  ) : (
      `https://raw.githubusercontent.com/radiantearth/stac-spec/v${stacVersion}`
    );

  let schemaUrl = (`${baseUrl}/${stacObjectType}-spec` +
    `/json-schema/${stacObjectType}.json`);

  const rsp = await fetchUri(schemaUrl);
  if (!rsp.ok) {
    throw new Error(`Loading error: ${rsp.statusText}`);
  }

  const schema = fixUpSchema(await rsp.json(), schemaUrl);

  const loadSchema = async function (uri) {
    let uriToFetch = modifyLoadSchemaUri(baseUrl, uri);

    // Fetching the $schema from json-schema.org was causing a recursive loop;
    // avoid fetching.
    if (uriToFetch.includes("http://json-schema.org/")) {
      return {};
    };

    const rsp = await fetchUri(uriToFetch);

    if (!rsp.ok) {
      throw new Error(`Loading error: ${rsp.statusText}`);
    }

    let loadedSchema = fixUpSchema(await rsp.json(), uriToFetch);

    return loadedSchema;
  };

  const ajv = new Ajv({
    loadSchema
  });


  return ajv.compileAsync(schema);
};

const getTileProxiedUri = (uri) => {
  // Tile sources can be proxied differently than other assets, replace any asset HREF with the proxied address.
  // Note: This will occur after the STAC_PROXY_URL is used.
  // TILE_PROXY_URL has the form https://thingtoproxy.com|http://proxy:111
  return !!TILE_PROXY_URL ? (
    uri.replace(TILE_PROXY_URL.split('|')[0], TILE_PROXY_URL.split('|')[1])
  ) : uri;
}

export const getTileSource = (assetHref) => {
  const proxiedUri = getTileProxiedUri(assetHref);
  return TILE_SOURCE_TEMPLATE.replace("{ASSET_HREF}", proxiedUri);
}
