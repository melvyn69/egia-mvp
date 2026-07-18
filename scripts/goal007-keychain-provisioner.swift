import Foundation
import Security

// This bridge is the only component allowed to materialize a macOS Keychain
// secret. It never returns the value to its parent process. Future authorized
// Runs invoke it with non-secret identifiers only; the bridge performs HTTPS
// writes itself and emits one allowlisted JSON status object.

enum BridgeError: Error {
    case invalidArguments
    case keychainRead
    case insecureEndpoint
    case network
    case remote(Int)
}

func readKeychain(service: String, account: String) throws -> Data {
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: service,
        kSecAttrAccount as String: account,
        kSecReturnData as String: true,
        kSecMatchLimit as String: kSecMatchLimitOne
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
          let data = item as? Data, !data.isEmpty else {
        throw BridgeError.keychainRead
    }
    return data
}

final class Goal007SelfTestURLProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let isVercel = request.url?.host == "vercel.goal007.invalid"
        let scenario = CommandLine.arguments.count > 3 ? CommandLine.arguments[3] : "invalid"
        if scenario == "timeout" || (scenario == "interruption" && !isVercel) {
            return
        }
        if scenario == "partial" && !isVercel {
            client?.urlProtocol(self, didFailWithError: URLError(.networkConnectionLost))
            return
        }
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: 201,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data("{}".utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

func write(
    url: URL,
    token: Data,
    body: Data,
    timeoutSeconds: TimeInterval = 10,
    protocolClasses: [AnyClass]? = nil
) async throws {
    guard url.scheme == "https" else { throw BridgeError.insecureEndpoint }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.timeoutInterval = timeoutSeconds
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer " + String(decoding: token, as: UTF8.self), forHTTPHeaderField: "Authorization")
    request.httpBody = body
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = timeoutSeconds
    configuration.timeoutIntervalForResource = timeoutSeconds
    if let protocolClasses { configuration.protocolClasses = protocolClasses }
    let session = URLSession(configuration: configuration)
    defer { session.invalidateAndCancel() }
    let (_, response) = try await session.data(for: request)
    guard let http = response as? HTTPURLResponse else { throw BridgeError.network }
    guard (200..<300).contains(http.statusCode) else { throw BridgeError.remote(http.statusCode) }
}

func jsonBody(_ object: Any) throws -> Data {
    try JSONSerialization.data(withJSONObject: object, options: [])
}

struct Goal007KeychainProvisioner {
    static let allowedSecretNames: Set<String> = [
        "INTERNAL_API_KEY_SLOT_A",
        "INTERNAL_API_KEY_SLOT_B",
        "APPLE_PASS_PRIVATE_KEY",
        "APPLE_PASS_CERTIFICATE_PASSWORD",
        "APPLE_PASS_CERTIFICATE",
        "APPLE_WWDR_CERTIFICATE",
        "APPLE_PASS_TYPE_IDENTIFIER",
        "APPLE_TEAM_IDENTIFIER"
    ]
    static let vercelEndpoint = URL(string: "https://api.vercel.com/v10/projects/prj_GoGCD7ICIfemLSlegN4Tc8JcoxrT/env?teamId=team_zfHqQFVkGjeOVDHZTYvfkMmW&upsert=true")!
    static let supabaseEndpoint = URL(string: "https://api.supabase.com/v1/projects/fhadiwkdznhuxtlgrwfd/secrets")!

    static func run() async {
        let args = CommandLine.arguments
        if args.count == 4, args[1] == "self-test", args[2] == "GOAL007_LOCAL_SWIFT_TEST_V1" {
            await runSelfTest(scenario: args[3])
            return
        }
        if args.count > 1, ["apply-apple-set", "resume-apple-vercel", "resume-apple-supabase", "rewrite-apple-all-after-unknown"].contains(args[1]) {
            await runAppleSet(args: args)
            return
        }
        guard args.count == 10,
              ["apply", "resume-vercel", "resume-supabase", "rewrite-all-after-unknown"].contains(args[1]),
              args[2] == "GOAL007_PREREQUISITE_SECRET_APPLY_V1",
              Self.allowedSecretNames.contains(args[5]) else {
            print(#"{"ok":false,"code":"INVALID_ARGUMENTS"}"#)
            exit(2)
        }
        let action = args[1]
        let operationId = UUID().uuidString
        var vercelWritten = action == "resume-supabase"
        var supabaseWritten = action == "resume-vercel"
        var currentTarget = "none"
        do {
            var secret = try readKeychain(service: args[3], account: args[4])
            let secretName = args[5]
            var vercelToken = try readKeychain(service: args[6], account: args[7])
            var supabaseToken = try readKeychain(service: args[8], account: args[9])
            defer {
                secret.resetBytes(in: 0..<secret.count)
                vercelToken.resetBytes(in: 0..<vercelToken.count)
                supabaseToken.resetBytes(in: 0..<supabaseToken.count)
            }
            let value = String(decoding: secret, as: UTF8.self)
            if action != "resume-supabase" {
                currentTarget = "vercel"
                try await write(
                    url: Self.vercelEndpoint,
                    token: vercelToken,
                    body: try jsonBody([
                        "key": secretName,
                        "value": value,
                        "type": "sensitive",
                        "target": ["production"]
                    ] as [String: Any])
                )
                vercelWritten = true
            }
            if action != "resume-vercel" {
                currentTarget = "supabase"
                try await write(
                    url: Self.supabaseEndpoint,
                    token: supabaseToken,
                    body: try jsonBody([["name": secretName, "value": value]])
                )
                supabaseWritten = true
            }
            print("{\"ok\":true,\"operationId\":\"\(operationId)\",\"vercel\":\"WRITTEN_NOT_CAPTURED\",\"supabase\":\"WRITTEN_IMMEDIATE\",\"activation\":false}")
        } catch BridgeError.remote(let status) {
            let normalized = [401, 403, 409, 429].contains(status) ? status : (status >= 500 ? 500 : 400)
            let uncertain = [409, 429, 500].contains(normalized)
            let unknownState = currentTarget == "supabase"
                ? (vercelWritten ? "VERCEL_WRITTEN_SUPABASE_OUTCOME_UNKNOWN" : "SUPABASE_OUTCOME_UNKNOWN")
                : (supabaseWritten ? "SUPABASE_WRITTEN_VERCEL_OUTCOME_UNKNOWN" : "VERCEL_OUTCOME_UNKNOWN")
            let knownState = vercelWritten
                ? "VERCEL_WRITTEN_NOT_CAPTURED"
                : (supabaseWritten ? "SUPABASE_WRITTEN" : "NO_WRITES")
            let state = uncertain ? unknownState : knownState
            print("{\"ok\":false,\"code\":\"HTTP_\(normalized)\",\"state\":\"\(state)\"}")
            exit(5)
        } catch BridgeError.keychainRead {
            print(#"{"ok":false,"code":"KEYCHAIN_READ_FAILED","state":"NO_WRITES"}"#)
            exit(5)
        } catch {
            let state = currentTarget == "supabase"
                ? (vercelWritten ? "VERCEL_WRITTEN_SUPABASE_OUTCOME_UNKNOWN" : "SUPABASE_OUTCOME_UNKNOWN")
                : (supabaseWritten ? "SUPABASE_WRITTEN_VERCEL_OUTCOME_UNKNOWN" : "VERCEL_OUTCOME_UNKNOWN")
            print("{\"ok\":false,\"code\":\"REMOTE_OUTCOME_UNKNOWN\",\"state\":\"\(state)\"}")
            exit(5)
        }
    }

    static func runAppleSet(args: [String]) async {
        let names = [
            "APPLE_PASS_TYPE_IDENTIFIER",
            "APPLE_TEAM_IDENTIFIER",
            "APPLE_PASS_CERTIFICATE",
            "APPLE_PASS_PRIVATE_KEY",
            "APPLE_PASS_CERTIFICATE_PASSWORD",
            "APPLE_WWDR_CERTIFICATE"
        ]
        guard args.count == 15,
              args[2] == "GOAL007_PREREQUISITE_SECRET_APPLY_V1",
              args[3] == "GOAL007_APPLE_PREFLIGHT_APPROVED_V1" else {
            print(#"{"ok":false,"code":"APPLE_SET_ARGUMENTS_INVALID"}"#)
            exit(2)
        }
        let action = args[1]
        let operationId = UUID().uuidString
        var materials: [Data] = []
        var vercelToken = Data()
        var supabaseToken = Data()
        var vercelWritten = action == "resume-apple-supabase"
        var supabaseWritten = action == "resume-apple-vercel"
        var currentTarget = "none"
        do {
            for index in 0..<names.count {
                materials.append(try readKeychain(service: args[5 + index], account: args[4]))
            }
            guard materials.count == names.count, materials.allSatisfy({ !$0.isEmpty }) else {
                throw BridgeError.keychainRead
            }
            vercelToken = try readKeychain(service: args[11], account: args[12])
            supabaseToken = try readKeychain(service: args[13], account: args[14])
            defer {
                for index in materials.indices {
                    materials[index].resetBytes(in: 0..<materials[index].count)
                }
                vercelToken.resetBytes(in: 0..<vercelToken.count)
                supabaseToken.resetBytes(in: 0..<supabaseToken.count)
            }
            let vercelValues: [[String: Any]] = names.enumerated().map { index, name in
                [
                    "key": name,
                    "value": String(decoding: materials[index], as: UTF8.self),
                    "type": "sensitive",
                    "target": ["production"]
                ]
            }
            let supabaseValues: [[String: String]] = names.enumerated().map { index, name in
                ["name": name, "value": String(decoding: materials[index], as: UTF8.self)]
            }
            if action != "resume-apple-supabase" {
                currentTarget = "vercel"
                try await write(
                    url: Self.vercelEndpoint,
                    token: vercelToken,
                    body: try jsonBody(vercelValues)
                )
                vercelWritten = true
            }
            if action != "resume-apple-vercel" {
                currentTarget = "supabase"
                try await write(
                    url: Self.supabaseEndpoint,
                    token: supabaseToken,
                    body: try jsonBody(supabaseValues)
                )
                supabaseWritten = true
            }
            print("{\"ok\":true,\"operationId\":\"\(operationId)\",\"vercel\":\"APPLE_SET_WRITTEN_NOT_CAPTURED\",\"supabase\":\"APPLE_SET_WRITTEN_IMMEDIATE\",\"activation\":false}")
        } catch BridgeError.keychainRead {
            print(#"{"ok":false,"code":"APPLE_SET_INCOMPLETE","state":"NO_WRITES"}"#)
            exit(5)
        } catch {
            let state = currentTarget == "supabase"
                ? (vercelWritten ? "VERCEL_APPLE_SET_WRITTEN_SUPABASE_OUTCOME_UNKNOWN" : "SUPABASE_APPLE_SET_OUTCOME_UNKNOWN")
                : (supabaseWritten ? "SUPABASE_APPLE_SET_WRITTEN_VERCEL_OUTCOME_UNKNOWN" : "VERCEL_APPLE_SET_OUTCOME_UNKNOWN")
            print("{\"ok\":false,\"operationId\":\"\(operationId)\",\"code\":\"REMOTE_OUTCOME_UNKNOWN\",\"state\":\"\(state)\"}")
            exit(5)
        }
    }

    static func runSelfTest(scenario: String) async {
        guard ["success", "partial", "timeout", "interruption"].contains(scenario),
              let vercelURL = URL(string: "https://vercel.goal007.invalid/secret"),
              let supabaseURL = URL(string: "https://supabase.goal007.invalid/secret") else {
            print(#"{"ok":false,"code":"SELF_TEST_ARGUMENTS_INVALID"}"#)
            exit(2)
        }
        let operationId = UUID().uuidString
        var secret = Data(repeating: 0x53, count: 48)
        var token = Data("synthetic-control-token".utf8)
        defer {
            secret.resetBytes(in: 0..<secret.count)
            token.resetBytes(in: 0..<token.count)
        }
        let value = secret.base64EncodedString()
        var vercelWritten = false
        let protocols: [AnyClass] = [Goal007SelfTestURLProtocol.self]
        do {
            try await write(
                url: vercelURL,
                token: token,
                body: try jsonBody(["key": "INTERNAL_API_KEY_SLOT_B", "value": value] as [String: Any]),
                timeoutSeconds: scenario == "timeout" ? 0.05 : 2,
                protocolClasses: protocols
            )
            vercelWritten = true
            let supabaseBody = try jsonBody([["name": "INTERNAL_API_KEY_SLOT_B", "value": value]])
            if scenario == "interruption" {
                let tokenCopy = token
                let requestTask = Task {
                    try await write(
                        url: supabaseURL,
                        token: tokenCopy,
                        body: supabaseBody,
                        timeoutSeconds: 2,
                        protocolClasses: protocols
                    )
                }
                try await Task.sleep(nanoseconds: 50_000_000)
                requestTask.cancel()
                try await requestTask.value
            } else {
                try await write(
                    url: supabaseURL,
                    token: token,
                    body: supabaseBody,
                    timeoutSeconds: scenario == "timeout" ? 0.05 : 2,
                    protocolClasses: protocols
                )
            }
            print("{\"ok\":true,\"operationId\":\"\(operationId)\",\"state\":\"BOTH_WRITTEN_INACTIVE\"}")
        } catch {
            let state = vercelWritten ? "VERCEL_WRITTEN_SUPABASE_OUTCOME_UNKNOWN" : "VERCEL_OUTCOME_UNKNOWN"
            print("{\"ok\":false,\"operationId\":\"\(operationId)\",\"code\":\"REMOTE_OUTCOME_UNKNOWN\",\"state\":\"\(state)\"}")
            exit(5)
        }
    }
}

let completion = DispatchSemaphore(value: 0)
Task {
    await Goal007KeychainProvisioner.run()
    completion.signal()
}
completion.wait()
