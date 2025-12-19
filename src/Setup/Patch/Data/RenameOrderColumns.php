<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Setup\Patch\Data;

use Magento\Framework\Setup\ModuleDataSetupInterface;
use Magento\Framework\Setup\Patch\DataPatchInterface;
use Magento\Framework\DB\Adapter\AdapterInterface;

/**
 * Rename order columns to use innosend_ prefix
 */
class RenameOrderColumns implements DataPatchInterface
{
    /**
     * @var ModuleDataSetupInterface
     */
    private $moduleDataSetup;

    /**
     * @param ModuleDataSetupInterface $moduleDataSetup
     */
    public function __construct(
        ModuleDataSetupInterface $moduleDataSetup
    ) {
        $this->moduleDataSetup = $moduleDataSetup;
    }

    /**
     * {@inheritdoc}
     */
    public function apply()
    {
        $connection = $this->moduleDataSetup->getConnection();
        $tableName = $this->moduleDataSetup->getTable('sales_order');

        // Check if old columns exist and new columns don't exist
        $columns = $connection->describeTable($tableName);
        $columnNames = array_keys($columns);

        // Rename pickup_point_id to innosend_pickup_point_id
        if (in_array('pickup_point_id', $columnNames) && !in_array('innosend_pickup_point_id', $columnNames)) {
            $connection->changeColumn(
                $tableName,
                'pickup_point_id',
                'innosend_pickup_point_id',
                [
                    'type' => \Magento\Framework\DB\Ddl\Table::TYPE_TEXT,
                    'length' => 255,
                    'nullable' => true,
                    'comment' => 'Innosend Pickup Point ID'
                ]
            );
        }

        // Rename pickup_point_name to innosend_pickup_point_name
        if (in_array('pickup_point_name', $columnNames) && !in_array('innosend_pickup_point_name', $columnNames)) {
            $connection->changeColumn(
                $tableName,
                'pickup_point_name',
                'innosend_pickup_point_name',
                [
                    'type' => \Magento\Framework\DB\Ddl\Table::TYPE_TEXT,
                    'length' => 255,
                    'nullable' => true,
                    'comment' => 'Innosend Pickup Point Name'
                ]
            );
        }

        // Rename pickup_point_address to innosend_pickup_point_address
        if (in_array('pickup_point_address', $columnNames) && !in_array('innosend_pickup_point_address', $columnNames)) {
            $connection->changeColumn(
                $tableName,
                'pickup_point_address',
                'innosend_pickup_point_address',
                [
                    'type' => \Magento\Framework\DB\Ddl\Table::TYPE_TEXT,
                    'length' => 255,
                    'nullable' => true,
                    'comment' => 'Innosend Pickup Point Address'
                ]
            );
        }

        // Rename carrier_code to innosend_courier_code
        if (in_array('carrier_code', $columnNames) && !in_array('innosend_courier_code', $columnNames)) {
            $connection->changeColumn(
                $tableName,
                'carrier_code',
                'innosend_courier_code',
                [
                    'type' => \Magento\Framework\DB\Ddl\Table::TYPE_TEXT,
                    'length' => 255,
                    'nullable' => true,
                    'comment' => 'Innosend Courier Code'
                ]
            );
        }

        return $this;
    }

    /**
     * {@inheritdoc}
     */
    public static function getDependencies()
    {
        return [];
    }

    /**
     * {@inheritdoc}
     */
    public function getAliases()
    {
        return [];
    }
}
