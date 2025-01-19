const { join } = require('path');
const { Stack, StackProps, RemovalPolicy, aws_logs, Duration, CfnOutput, aws_iam: iam } = require('aws-cdk-lib');
const { AttributeType, Table, BillingMode } = require('aws-cdk-lib/aws-dynamodb');
const { Runtime, Architecture, LoggingFormat, Tracing, Code } = require('aws-cdk-lib/aws-lambda');
const { NodejsFunction } = require('aws-cdk-lib/aws-lambda-nodejs');
const { HostedZone, ARecord, RecordTarget } = require('aws-cdk-lib/aws-route53');
const { ApiGateway: ApiGatewayTarget } = require('aws-cdk-lib/aws-route53-targets');
const { Certificate, CertificateValidation } = require('aws-cdk-lib/aws-certificatemanager');
const { LambdaIntegration, ApiKeySourceType, RestApi, Cors, ApiKey, UsagePlan, Model, RequestValidator, JsonSchemaType } = require('aws-cdk-lib/aws-apigateway');

class UrlShortenerCustomMetricsStack extends Stack {
  /**
   *
   * @param {Construct} scope
   * @param {string} id
   * @param {StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    const itemPK = 'urlId';

    const dynamoTable = new Table(this, 'ShortenedUrls', {
      partitionKey: {
        name: itemPK,
        type: AttributeType.STRING
      },
      tableName: 'ShortenedUrls',
      removalPolicy: RemovalPolicy.DESTROY,
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
    });

    const nodeJsFunctionProps = {
      depsLockFilePath: join(__dirname, '..', 'package-lock.json'),
      memorySize: 512,
      environment: {
        PRIMARY_KEY: itemPK,
        TABLE_NAME: dynamoTable.tableName,
      },
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      loggingFormat: LoggingFormat.JSON,
      logRetention: aws_logs.RetentionDays.ONE_WEEK,
      timeout: Duration.seconds(30),
      tracing: Tracing.ACTIVE,
    }

    const redirectLambda = new NodejsFunction(this, 'RedirectURLLambda', {
      entry: join(__dirname, '..', 'src', 'redirect-lambda.js'),
      handler: 'handler',
      functionName: 'RedirectURLLambda',
      logRetention: aws_logs.RetentionDays.ONE_WEEK,
      ...nodeJsFunctionProps,
    });

    redirectLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['cloudwatch:PutMetricData'],
      resources: ['*'],
    }));

    const createRedirectLambda = new NodejsFunction(this, 'CreateRedirectURLLambda', {
      entry: join(__dirname, '..', 'src', 'create-redirect-lambda.js'),
      handler: 'handler',
      functionName: 'CreateRedirectURLLambda',
      ...nodeJsFunctionProps,
    });

    dynamoTable.grantReadData(redirectLambda);
    dynamoTable.grantWriteData(createRedirectLambda);

    // Integrate the Lambda functions with the API Gateway resource
    const redirectIntegration = new LambdaIntegration(redirectLambda);
    const createRedirectIntegration = new LambdaIntegration(createRedirectLambda);

    const domainName = process.env.DOMAIN_NAME ?? 'default.com';
    const endpointURL = `link.${domainName}`;

    const hostedZone = HostedZone.fromLookup(this, 'TLDHostedZone', {
      domainName: domainName
    });

    const apiCertificate = new Certificate(this, 'APICert', {
      domainName: endpointURL,
      validation: CertificateValidation.fromDns(hostedZone),
    });
    const api = new RestApi(this, 'PublicRedirectAPI', {
      restApiName: 'PublicRedirectAPI',
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST'],
      },
      disableExecuteApiEndpoint: true,
      apiKeySourceType: ApiKeySourceType.HEADER,
      deployOptions: {
        tracingEnabled: true,
      },
      domainName: {
        domainName: endpointURL,
        certificate: apiCertificate,
      },
    });

    const record = new ARecord(this, "TodoApplicationAPIRecord", {
      recordName: endpointURL,
      zone: hostedZone,
      target: RecordTarget.fromAlias(new ApiGatewayTarget(api))
    });

    const apiKey = new ApiKey(this, 'ApiKey');

    const usagePlan = new UsagePlan(this, 'UsagePlan', {
      name: 'Usage Plan',
      apiStages: [
        {
          api,
          stage: api.deploymentStage,
        },
      ],
    });

    usagePlan.addApiKey(apiKey);

    const createRedirectModel = new Model(this, 'CreateRedirectModel', {
      restApi: api,
      modelName: 'CreateRedirectModel',
      contentType: 'application/json',
      schema: {
        type: JsonSchemaType.OBJECT,
        properties: {
          originalURL: {
            type: JsonSchemaType.STRING,
            minLength: 5,
          },
          ttlInSeconds: {
            type: JsonSchemaType.INTEGER,
            minimum: 3600,
            maximum: 8640000,
          },
        },
        required: ['originalURL', 'ttlInSeconds'],
      },
    });

    const rootResource = api.root.addResource('{id}', {
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST'],
      },
    });
    rootResource.addMethod('GET', redirectIntegration);
    rootResource.addMethod('POST', createRedirectIntegration, {
      apiKeyRequired: true,
      requestValidator: new RequestValidator(
        this,
        "body-validator",
        {
          restApi: api,
          requestValidatorName: "body-validator",
          validateRequestBody: true,
        }
      ),
      requestModels: {
        "application/json": createRedirectModel,
      },
    });

    new CfnOutput(this, "customAPIUrlOutput", {
      value: record.domainName,
    })

    new CfnOutput(this, 'API Key ID', {
      value: apiKey.keyId,
    });
  }
}

module.exports = { UrlShortenerCustomMetricsStack }
