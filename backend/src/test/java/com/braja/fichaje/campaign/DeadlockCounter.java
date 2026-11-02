package com.braja.fichaje.campaign;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * The InnoDB lock_deadlocks counter (I14), read through a root connection because the application user lacks PROCESS.
 * Read only; the connection is closed after each read. Fails loudly when the metric is missing or disabled, since a
 * disabled counter would let every deadlock go unseen. Same logic as {@code LockOrderSpecTest.deadlocks()}.
 */
public final class DeadlockCounter {
    private DeadlockCounter() { }

    public static long read() {
        try (Connection connection = DriverManager.getConnection(SharedMySql.jdbcUrl(), "root", SharedMySql.MYSQL.getPassword());
             Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery("SELECT COUNT, STATUS FROM information_schema.INNODB_METRICS WHERE NAME='lock_deadlocks'")) {
            if (!rs.next()) throw new IllegalStateException("lock_deadlocks metric missing");
            String status = rs.getString("STATUS");
            if (!"enabled".equals(status)) throw new IllegalStateException("lock_deadlocks is " + status + ": deadlocks would go unseen");
            return rs.getLong("COUNT");
        } catch (SQLException ex) {
            throw new IllegalStateException("cannot read INNODB_METRICS", ex);
        }
    }
}
