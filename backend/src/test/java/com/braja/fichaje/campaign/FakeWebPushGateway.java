package com.braja.fichaje.campaign;

import com.braja.fichaje.notifications.PushEndpointValidator;
import com.braja.fichaje.notifications.PushSubscriptionMaterial;
import com.braja.fichaje.notifications.PushSubscriptionRequest;
import com.braja.fichaje.notifications.WebPushDeliveryException;
import com.braja.fichaje.notifications.WebPushGateway;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Replaces the VAPID gateway: records every delivery and answers with programmed outcomes (S56).
 * It validates the stored material like the real gateway does, so bad rows still fail the same way.
 */
public final class FakeWebPushGateway implements WebPushGateway {
    public record Delivery(String endpoint, String payload, String topic, int status) { }

    /** A programmed outcome: an HTTP status, or a transport failure when {@code failure} is true. */
    public record Outcome(int status, boolean failure) {
        public static Outcome status(int status) { return new Outcome(status, false); }
        public static Outcome transportFailure() { return new Outcome(0, true); }
    }

    private final PushEndpointValidator validator;
    private final Deque<Outcome> programmed = new ArrayDeque<>();
    private final List<Delivery> deliveries = new CopyOnWriteArrayList<>();
    private Outcome fallback = Outcome.status(201);

    public FakeWebPushGateway(PushEndpointValidator validator) {
        this.validator = validator;
    }

    @Override
    public int send(PushSubscriptionMaterial subscription, String payload, String topic) {
        validator.validate(new PushSubscriptionRequest(subscription.endpoint(),
                new PushSubscriptionRequest.Keys(subscription.p256dh(), subscription.auth())));
        Outcome outcome = next();
        if (outcome.failure()) {
            deliveries.add(new Delivery(subscription.endpoint(), payload, topic, 0));
            throw new WebPushDeliveryException("WEB_PUSH_FAILURE", new java.io.IOException("simulated timeout"));
        }
        deliveries.add(new Delivery(subscription.endpoint(), payload, topic, outcome.status()));
        return outcome.status();
    }

    /** Queues outcomes consumed one per send, in order; afterwards the fallback answers. */
    public synchronized void program(Outcome... outcomes) {
        programmed.addAll(List.of(outcomes));
    }

    /** The answer for every send once the programmed queue is empty. */
    public synchronized void answerAlways(Outcome outcome) {
        fallback = outcome;
    }

    public List<Delivery> deliveries() {
        return List.copyOf(deliveries);
    }

    public synchronized void reset() {
        programmed.clear();
        deliveries.clear();
        fallback = Outcome.status(201);
    }

    private synchronized Outcome next() {
        Outcome queued = programmed.pollFirst();
        return queued != null ? queued : fallback;
    }
}
