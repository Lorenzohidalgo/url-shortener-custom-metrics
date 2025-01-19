#!/usr/bin/env node

const { App } = require('aws-cdk-lib');
const { UrlShortenerCustomMetricsStack } = require('../lib/url-shortener-custom-metrics-stack');

const app = new App();

new UrlShortenerCustomMetricsStack(app, 'UrlShortenerCustomMetricsStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});

app.synth();