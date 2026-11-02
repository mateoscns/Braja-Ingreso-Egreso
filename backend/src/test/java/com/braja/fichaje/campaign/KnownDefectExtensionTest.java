package com.braja.fichaje.campaign;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.junit.jupiter.api.extension.InvocationInterceptor.Invocation;
import org.junit.jupiter.api.extension.ReflectiveInvocationContext;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The extension turns the expected failure into a pass and an unexpected pass into a failure. */
class KnownDefectExtensionTest {
    static final class Samples {
        @KnownDefect(issue = "#0", reason = "sample")
        void annotated() { }

        void plain() { }
    }

    private final KnownDefectExtension extension = new KnownDefectExtension();
    private final ExtensionContext context = mock(ExtensionContext.class);

    @Test
    void anExpectedAssertionFailurePassesAndIsReported() {
        assertDoesNotThrow(() -> extension.interceptTestMethod(failing(new AssertionError("still broken")), on("annotated"), context));
        verify(context).publishReportEntry(eq("known-defect"), startsWith("#0: sample | still broken"));
    }

    @Test
    void aPassingKnownDefectFailsSoTheFixIsNoticed() {
        AssertionError error = assertThrows(AssertionError.class,
                () -> extension.interceptTestMethod(passing(), on("annotated"), context));
        assertTrue(error.getMessage().contains("Remove @KnownDefect"));
    }

    @Test
    void anUnexpectedExceptionStillFails() {
        assertThrows(IllegalStateException.class,
                () -> extension.interceptTestMethod(failing(new IllegalStateException("setup broke")), on("annotated"), context));
    }

    @Test
    void aTestWithoutTheAnnotationRunsUnchanged() {
        assertThrows(AssertionError.class,
                () -> extension.interceptTestMethod(failing(new AssertionError("real failure")), on("plain"), context));
    }

    @SuppressWarnings("unchecked")
    private static ReflectiveInvocationContext<Method> on(String name) throws NoSuchMethodException {
        ReflectiveInvocationContext<Method> invocation = mock(ReflectiveInvocationContext.class);
        when(invocation.getExecutable()).thenReturn(Samples.class.getDeclaredMethod(name));
        return invocation;
    }

    private static Invocation<Void> passing() {
        return () -> null;
    }

    private static Invocation<Void> failing(Throwable error) {
        return () -> {
            throw error;
        };
    }
}
