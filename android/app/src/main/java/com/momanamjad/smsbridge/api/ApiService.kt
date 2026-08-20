package com.momanamjad.smsbridge.api

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST

interface ApiService {
    @GET("/api/health")
    suspend fun health(): HealthResponse

    @POST("/api/devices/register")
    suspend fun register(
        @Header("X-Register-Secret") secret: String,
        @Body body: RegisterRequest,
    ): RegisterResponse

    @POST("/api/messages/sms")
    suspend fun postSms(
        @Header("Authorization") authorization: String,
        @Body body: SmsRequest,
    ): Response<SmsResponse>

    @POST("/api/messages/call")
    suspend fun postCall(
        @Header("Authorization") authorization: String,
        @Body body: CallRequest,
    ): Response<CallResponse>

    @POST("/api/calls/incoming")
    suspend fun postWebRtcIncoming(
        @Header("Authorization") authorization: String,
        @Body body: WebRtcIncomingRequest,
    ): Response<WebRtcIncomingResponse>

    @POST("/api/calls/outgoing")
    suspend fun postWebRtcOutgoing(
        @Header("Authorization") authorization: String,
        @Body body: WebRtcOutgoingRequest,
    ): Response<WebRtcOutgoingResponse>

    @POST("/api/calls/ended")
    suspend fun postWebRtcEnded(
        @Header("Authorization") authorization: String,
        @Body body: WebRtcEndedRequest,
    ): Response<WebRtcEndedResponse>
}
