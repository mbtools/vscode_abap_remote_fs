import { DebugConfiguration, DebugSession, Disposable } from "vscode";
import { Handles, InitializedEvent, LoggingDebugSession, Scope, StoppedEvent, Thread } from "vscode-debugadapter";
import { DEBUGTYPE } from "./abapConfigurationProvider";
import { DebugProtocol } from 'vscode-debugprotocol';
import { DebugService } from "./debugService";
import { AbapDebugAdapterFactory } from "./AbapDebugAdapterFactory";

export interface AbapDebugConfiguration extends DebugConfiguration {
    connId: string
}
export interface AbapDebugSessionCfg extends DebugSession {
    configuration: AbapDebugConfiguration
}

export class AbapDebugSession extends LoggingDebugSession {
    private sub: Disposable;
    private variableHandles = new Handles<string>();

    constructor(private connId: string, private readonly service: DebugService) {
        super(DEBUGTYPE)
        this.sub = service.addListener(e => {
            this.sendEvent(e)
        })
    }

    protected dispatchRequest(request: DebugProtocol.Request) {
        super.dispatchRequest(request)
    }
    protected async setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments, request?: DebugProtocol.Request) {
        const { source, breakpoints = [] } = args
        response.body = { breakpoints: await this.service.setBreakpoints(source, breakpoints) }
        this.sendResponse(response)
    }


    public async logOut() {
        if (this.service) {
            this.sub.dispose()
            await this.service.logout()
            AbapDebugAdapterFactory.instance.sessionClosed(this)
        }
    }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        response.body = { threads: [new Thread(1, "Single thread")] }
        this.sendResponse(response)
    }

    protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments): void {
        this.service.debuggerStep("stepInto");
        this.sendResponse(response);
    }

    protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
        this.service.debuggerStep("stepContinue");
        this.sendResponse(response);
    }

    protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
        this.service.debuggerStep("stepOver");
        this.sendResponse(response);
    }

    protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments): void {
        this.service.debuggerStep("stepReturn");
        this.sendResponse(response);
    }


    protected async disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments, request?: DebugProtocol.Request) {
        await this.logOut()
        super.disconnectRequest(response, args, request)
    }

    protected async attachRequest(response: DebugProtocol.AttachResponse, args: DebugProtocol.AttachRequestArguments, request?: DebugProtocol.Request) {
        try {
            this.service.mainLoop()
            response.success = true
        } catch (error) {
            response.message = `Failed to connect debugger for ${this.connId}:${error.message}`
            response.success = false
        }
        this.sendResponse(response)
    }

    protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments): void {
        this.sendResponse(response)
    }

    protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {
        const stackFrames = this.service.getStack()
        response.body = {
            stackFrames,
            totalFrames: stackFrames.length
        }
    }

    protected breakpointLocationsRequest(response: DebugProtocol.BreakpointLocationsResponse, args: DebugProtocol.BreakpointLocationsArguments, request?: DebugProtocol.Request): void {
        if (args.source.path) {
            const bps = this.service.getBreakpoints(args.source.path);
            response.body = { breakpoints: bps.map(col => ({ line: args.line, column: col.column })) };
        } else response.body = { breakpoints: [] };

        this.sendResponse(response)
    }

    protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {

        response.body = {
            scopes: [
                new Scope("Local", this.variableHandles.create("local"), false),
                new Scope("Global", this.variableHandles.create("global"), true)
            ]
        };
        this.sendResponse(response);
    }

    protected async variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments, request?: DebugProtocol.Request) {
        this.sendResponse(response);
    }

    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        response.body = {
            // supportsBreakpointLocationsRequest: true,
            supportsCancelRequest: true,
            supportsStepInTargetsRequest: true,
            supportsConfigurationDoneRequest: true,
            supportsTerminateRequest: true,
            supportsSetVariable: true,
            // supportsInstructionBreakpoints: true,


            // supportsEvaluateForHovers: true,
            // supportsStepBack: true,
            // supportsDataBreakpoints: true,
            // supportsCompletionsRequest : true,
            // supportsExceptionFilterOptions : true,
            // supportsExceptionInfoRequest : true,
        }

        this.sendResponse(response)
        this.sendEvent(new InitializedEvent());
    }

}